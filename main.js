/*
 * Copyright (c) 2012 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */


/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, brackets, window, $, Mustache */

define(function (require, exports, module) {
    "use strict";
    
    // Brackets modules
    var CommandManager      = brackets.getModule("command/CommandManager"),
        DocumentManager     = brackets.getModule("document/DocumentManager"),
        EditorManager       = brackets.getModule("editor/EditorManager"),
        ExtensionUtils      = brackets.getModule("utils/ExtensionUtils"),
        FileUtils           = brackets.getModule("file/FileUtils"),
        KeyBindingManager   = brackets.getModule("command/KeyBindingManager"),
        KeyEvent            = brackets.getModule("utils/KeyEvent"),
        MainViewManager     = brackets.getModule("view/MainViewManager"),
        Menus               = brackets.getModule("command/Menus"),
        TokenUtils          = brackets.getModule("utils/TokenUtils"),
        WorkspaceManager    = brackets.getModule("view/WorkspaceManager"),
        _                   = brackets.getModule("thirdparty/lodash");

    var data                = JSON.parse(require("text!data.json")),
        panelHtml           = require("text!templates/bottom-panel.html"),
        tableRowHtml        = require("text!templates/table-row.html");

    var TOGGLE_QUICK_MARKUP      = "redmunds.brackets-quick-markup.edit.toggle-quick-markup",
        TOGGLE_QUICK_MARKUP_HELP = "redmunds.brackets-quick-markup.edit.toggle-quick-markup-help";

    var modeQuickMarkup     = false,
        helpQuickMarkup     = false,
        heightHeader        = 30,
        cmdMarkup,
        cmdHelp,
        doc,
        docMode,
        editor,
        $quickMarkupPanel;

    // Maintain a list of Ctrl/Cmd key bindings so we can determine conflicts
    // (so they can be disabled in Quick Markup mode). Conflicts are determined
    // whenever QM mode is entered so bindings of extensions installed during
    // session are captured. This will not capture bindings for extensions installed
    // while in QM mode! Bindings are restored when QM mode is exited.
    // 
    // Note: not sure why Ctrl+Enter is overridden correctly...
    var conflictingBindingsArray = [],
        origKeymap;


    function initDocument(testDocument, testEditor) {
        doc     = testDocument || DocumentManager.getCurrentDocument();
        editor  = testEditor   || EditorManager.getCurrentFullEditor();
        if (editor) {
            // mode may be a string or an object (with name property)
            var cmMode = editor.getModeForDocument();
            docMode = (typeof cmMode === "string") ? cmMode : cmMode.name;
            docMode = docMode.toLowerCase();
        } else {
            docMode = "";
        }
    }

    function clearDocument() {
        doc     = null;
        editor  = null;
        docMode = "";
    }

    // Note: To add another mode, may also need to update function htmlState()
    function isHtmlDoc() {
        return (docMode && (docMode.match(/html/) || docMode.match(/php/)));
    }

    function isHeadingTag(tagName) {
        var tag = data.markupTags[tagName];
        return (tag && tag.type === "heading");
    }

    function isInlineTag(tagName) {
        var tag = data.markupTags[tagName];
        return (tag && tag.type === "inline");
    }

    function isTextFormattingTag(tagName) {
        var tag = data.markupTags[tagName];
        return (tag && tag.type === "block");
    }

    function getLineEnding() {
        return (FileUtils.getPlatformLineEndings() === FileUtils.LINE_ENDINGS_CRLF) ? "\r\n" : "\n";
    }

    function isIP(sel) {
        return (sel.start.ch === sel.end.ch && sel.start.line === sel.end.line);
    }

    // val my be null, a single edit, or array of edits
    function queueEdits(edits, val) {
        if (val) {
            if (Array.isArray(val)) {
                val.forEach(function (v) {
                    edits.push(v);
                });
            } else {
                edits.push(val);
            }
        }
        
        return edits;   // for chaining
    }

    // no-op edit to indicate that we handled keystroke and event is not propagated
    function noOpEdit(sel) {
        return {
            edit: {text: "", start: sel.start, end: sel.start},
            selection: {start: sel.start, end: sel.start, primary: sel.primary, isBeforeEdit: true}
        };
    }

    function getTagNameFromKeyCode(keyCode) {
        var char = String.fromCharCode(keyCode),
            tagName;

        for (tagName in data.markupTags) {
            if (data.markupTags.hasOwnProperty(tagName)) {
                if (data.markupTags[tagName].shortcut.toUpperCase() === char) {
                    return tagName;
                }
            }
        }

        return "";
    }

    // Helper function to find htmlState object. This function assumes document has already
    // been verified to be either "html" or "php". It's also been verified that section of
    // doc is "html" (as opposed to "css" or "javascript"), but that shouldn't matter here.
    function htmlState(ctx) {
        // CodeMirror tokenizer places object differently for these modes
        return ctx.token.state.htmlState || ctx.token.state.html.htmlState;
    }

    // Determine if IP in tag is at start of content: <tag>|content</tag>
    function isStartOfContent(pos, ctx) {
        if (ctx.token.type === "tag bracket" && ctx.token.string === ">") {
            // IP position column is at end of start tag.
            // verify previous token is open tag token.
            var posTag = $.extend(true, {}, pos),
                ctxNext = TokenUtils.getInitialContext(editor._codeMirror, posTag);

            // backup over attributes to the tag
            do {
                TokenUtils.movePrevToken(ctxNext);
            } while (ctxNext.token.type !== "tag");

            return (
                htmlState(ctxNext).state.name === "attrState" &&
                ctxNext.token.string === htmlState(ctx).context.tagName.toLowerCase()
            );
        }

        return false;
    }

    // Determine if IP in tag is at end of content: <tag>content|</tag>
    function isEndOfContent(pos, ctx) {
        if (ctx.token.end === pos.ch && (ctx.token.type === null || ctx.token.type === "tag bracket")) {
            // IP position column is at end of text string
            var posTag = $.extend(true, {}, pos),
                ctxNext = TokenUtils.getInitialContext(editor._codeMirror, posTag);

            // verify next token is tag-close delimiter
            TokenUtils.moveNextToken(ctxNext);
            if (ctxNext.token.type !== "tag bracket" || ctxNext.token.string !== "</") {
                return false;
            }

            // verify next token is tag
            TokenUtils.moveNextToken(ctxNext);

            return (
                ctxNext.token.type === "tag" &&
                htmlState(ctxNext).state.name === "closeState" &&
                ctxNext.token.string === htmlState(ctx).context.tagName.toLowerCase()
            );
        }

        return false;
    }

    function getTagRangeFromIP(tagName, sel) {
        // Go backwards to the start of the tag
        var tagRangeStart = $.extend({}, sel.start),
            tagRangeEnd   = $.extend({}, sel.end),
            ctx = TokenUtils.getInitialContext(editor._codeMirror, tagRangeStart);

        while (TokenUtils.moveSkippingWhitespace(TokenUtils.movePrevToken, ctx)) {
            if (ctx.token.type === "tag" && ctx.token.string === tagName) {
                // move to prev token to get "<[tag]"
                TokenUtils.movePrevToken(ctx);
                tagRangeStart.ch = ctx.token.start;
                break;
            }
        }

        // Go forward to the end of the tag
        var closeBracketFound = false;
        ctx = TokenUtils.getInitialContext(editor._codeMirror, tagRangeEnd);

        while (TokenUtils.moveSkippingWhitespace(TokenUtils.moveNextToken, ctx)) {
            if (!closeBracketFound) {
                if (ctx.token.type === "tag bracket" && ctx.token.string === "</") {
                    closeBracketFound = true;
                }
            } else if (closeBracketFound) {
                if (ctx.token.type === "tag" && ctx.token.string === tagName) {
                    // move 1 more token to get ">"
                    TokenUtils.moveNextToken(ctx);
                    tagRangeEnd.ch = ctx.token.end;
                    break;
                } else {
                    closeBracketFound = false;
                }
            }
        }
        
        return { start: tagRangeStart, end: tagRangeEnd };
    }

    function changeTagName(oldTagName, newTagName, sel) {
        var selTag = getTagRangeFromIP(oldTagName, sel),
            oldTagStr = "",
            newTagStr = "",
            oldStartTagIndex;

        // verify tag selection is an not IP
        if (isIP(selTag)) {
            return null;
        }

        // only search on "<h1" (for example) to preserve attributes
        oldTagStr = doc.getRange(selTag.start, selTag.end);
        if (oldTagStr.indexOf("<" + oldTagName) !== 0) {
            return null;
        }
        oldStartTagIndex = oldTagStr.indexOf(">");

        // TODO: only works with no attributes
        if (newTagName !== "") {
            newTagStr += "<" + newTagName;
            newTagStr += oldTagStr.substr(oldTagName.length + 1,
                                          (oldStartTagIndex - oldTagName.length));
        }
        newTagStr += oldTagStr.substr(oldStartTagIndex + 1);

        var oldCloseTag = "</" + oldTagName + ">",
            oldCloseTagIndex = (newTagStr.length - oldCloseTag.length);
        if (newTagStr.indexOf(oldCloseTag) !== oldCloseTagIndex) {
            return null;
        }
        
        newTagStr = newTagStr.substr(0, oldCloseTagIndex);
        if (newTagName !== "") {
            newTagStr += "</" + newTagName + ">";
        }

        // restore selection
        var chDiff = 0;
        if (newTagName === "") {
            chDiff = -oldStartTagIndex - 1;
        } else {
            chDiff = (newTagName.length - oldTagName.length);
        }
        if (chDiff !== 0) {
            sel.start.ch += chDiff;
            sel.end.ch   += chDiff;
        }

        return {
            edit: {text: newTagStr, start: selTag.start, end: selTag.end},
            selection: {start: sel.start, end: sel.end, primary: sel.primary, isBeforeEdit: false}
        };
    }

    function wrapTagAroundSelection(tagName, sel, isBlock) {
        var selText = doc.getRange(sel.start, sel.end),
            openTag = "<" + tagName + ">",
            closeTag = "</" + tagName + ">",
            insertString = openTag + selText + closeTag,
            replSelEnd = $.extend({}, sel.end);

        if (isIP(sel)) {
            var trailingText, endPos;

            // Selection is IP. If all text past IP is whitespace...
            endPos = { ch: doc.getLine(sel.end.line).length, line: sel.end.line};
            trailingText = doc.getRange(sel.start, endPos);
            if (!trailingText.match(/\S/)) {
                // ...then strip it, because markup is indented below.
                replSelEnd.ch = endPos.ch;
            }
        }

        // reset selection
        var selNewStart = $.extend({}, sel.start),
            selNewEnd   = $.extend({}, sel.end);
        if (isIP(sel)) {
            selNewStart.ch += openTag.length;
            selNewEnd.ch   += openTag.length;
        } else {
            selNewStart.ch += openTag.length;
            if (sel.start.line === sel.end.line) {
                selNewEnd.ch += openTag.length;
            }
        }
 
        return {
            edit: {text: insertString, start: sel.start, end: replSelEnd},
            selection: {start: selNewStart, end: selNewEnd, primary: sel.primary, isBeforeEdit: false}
        };
    }

    // 2015.02.21 sygnas
    function wrapTagAroundCustomTag(newTagPair, sel, isBlock) {
        var selText = doc.getRange(sel.start, sel.end),
            openTag = newTagPair[0],
            closeTag = newTagPair.length === 2 ? newTagPair[1] : "",
            insertString = openTag + selText + closeTag,
            replSelEnd = $.extend({}, sel.end);

        // reset selection
        var selNewStart = $.extend({}, sel.start),
            selNewEnd   = $.extend({}, sel.end);

        selNewStart.ch += openTag.length;
        if (sel.start.line === sel.end.line) {
            selNewEnd.ch += openTag.length;
        }
 
        return {
            edit: {text: insertString, start: sel.start, end: replSelEnd},
            selection: {start: selNewStart, end: selNewEnd, primary: sel.primary, isBeforeEdit: false}
        };
    }
    
    function getAttributeString(tagName, sel) {
        var selAttrStart = $.extend({}, sel.start),
            ctxAttr = TokenUtils.getInitialContext(editor._codeMirror, selAttrStart),
            attrStr = "";

        // move to the start tag
        // TODO: fix case where tag has nested tags between IP and open tag: <p id="x">a <em>b</em> c|</p>
        do {
            if (ctxAttr.token.type === "tag bracket" && htmlState(ctxAttr).context.tagName.toLowerCase() === tagName) {
                break;
            }
        } while (TokenUtils.moveSkippingWhitespace(TokenUtils.movePrevToken, ctxAttr));

        // collect attributes string
        while (TokenUtils.movePrevToken(ctxAttr)) {
            if (ctxAttr.token.type === "tag") {
                break;
            } else if (htmlState(ctxAttr).state.name.substring(0, 4) === "attr") {
                // going backwards, so prepend
                attrStr = ctxAttr.token.string + attrStr;
            } else {
                break;  // unknown state, so break to be safe
            }
        }

        return attrStr;
    }

    function splitTag(tagName, attrStr, sel) {
        var insertString = "</" + tagName + ">" + getLineEnding() +
                           "<" + tagName + attrStr + ">";

        return {
            edit: {text: insertString, start: sel.start},
            selection: {start: sel.start, end: sel.start, primary: sel.primary, isBeforeEdit: true}
        };
    }

    // uses start pos
    function addTagOnNextLine(tagName, attrStr, sel) {
        var insertString = getLineEnding() + "<" + tagName + attrStr + "></" + tagName + ">",
            startLineLen = editor._codeMirror.getLine(sel.start.line).length,
            newSelCh = tagName.length + attrStr.length + 2;

        // move edit selection to end of line
        var insertPos = {
            start: {line: sel.start.line, ch: startLineLen},
            end:   {line: sel.start.line, ch: startLineLen}
        };

        // put selection inside new tag
        var newSel = {
            start: {line: sel.start.line + 1, ch: newSelCh},
            end:   {line: sel.start.line + 1, ch: newSelCh}
        };

        return {
            edit: {text: insertString, start: insertPos.start},
            selection: {start: newSel.start, end: newSel.start, primary: sel.primary, isBeforeEdit: false}
        };
    }

    function handleEnterKey(sel, ctx) {
        // only operate on IP
        if (!isIP(sel)) {
            return null;
        }

        var tagName = htmlState(ctx).context.tagName.toLowerCase(),
            attrStr = "",
            edits = [];

        // currently only for block-level tags
        if (!isTextFormattingTag(tagName) && !isHeadingTag(tagName)) {
            return null;
        }

        if (isHeadingTag(tagName) && isEndOfContent(sel.start, ctx)) {
            // if IP is at end of heading tag when Ctrl-Enter is pressed, then
            // user is most likely typing, and wants a paragraph after heading.
            return queueEdits(edits, addTagOnNextLine("p", "", sel));
        }

        attrStr = getAttributeString(tagName, sel);

        return queueEdits(edits, splitTag(tagName, attrStr, sel));
    }

    function handleDeleteKey(sel, ctx) {
        // only operate on IP
        if (!isIP(sel)) {
            return null;
        }

        // determine if tag is joinable
        var tagName = htmlState(ctx).context.tagName.toLowerCase();
        if (!isTextFormattingTag(tagName) && !isHeadingTag(tagName)) {
            return null;
        }

        // only valid at end of content
        if (!isEndOfContent(sel.start, ctx)) {
            return null;
        }

        // determine if there is a next sibling tag
        var selNextTagEnd = $.extend({}, sel.end);
        var ctxNextTag = TokenUtils.getInitialContext(editor._codeMirror, selNextTagEnd);

        // move to the close tag delimiter
        while (TokenUtils.moveSkippingWhitespace(TokenUtils.moveNextToken, ctxNextTag)) {
            if (ctxNextTag.token.type === "tag bracket" && ctxNextTag.token.string === "</") {
                break;
            }
        }

        // move to the close tag name
        while (TokenUtils.moveSkippingWhitespace(TokenUtils.moveNextToken, ctxNextTag)) {
            if (ctxNextTag.token.type === "tag" && ctxNextTag.token.string === tagName) {
                TokenUtils.moveNextToken(ctxNextTag);   // skip ">"
                break;
            }
        }

        // next non-whitespace token must be open tag delimter
        TokenUtils.moveSkippingWhitespace(TokenUtils.moveNextToken, ctxNextTag);
        if (ctxNextTag.token.type !== "tag bracket" || ctxNextTag.token.string === ">") {
            return null;
        }

        // next non-whitespace token must be open tag
        TokenUtils.moveSkippingWhitespace(TokenUtils.moveNextToken, ctxNextTag);
        if (ctxNextTag.token.type !== "tag" || htmlState(ctxNextTag).state.name !== "attrState") {
            return null;
        }

        // determine if next tag is same as current tag.
        var nextTagName = htmlState(ctxNextTag).tagName.toLowerCase();
        if (tagName !== nextTagName) {
            // return a no-op edit to indicate that we handled keystroke so end tag is not partially deleted
            return noOpEdit(sel);
        }

        // move selection past attributes to end of open tag
        while (TokenUtils.moveSkippingWhitespace(TokenUtils.moveNextToken, ctxNextTag)) {
            if (htmlState(ctxNextTag).state.name === "baseState") {
                break;
            }
        }

        // delete range
        return {
            edit: {text: "", start: sel.start, end: selNextTagEnd},
            selection: {start: sel.start, end: sel.start, primary: sel.primary, isBeforeEdit: true}
        };
    }

    function handleBackspaceKey(sel, ctx) {
        // only operate on IP
        if (!isIP(sel)) {
            return null;
        }

        // determine if tag is joinable
        var tagName = htmlState(ctx).context.tagName.toLowerCase();
        if (!isTextFormattingTag(tagName) && !isHeadingTag(tagName)) {
            return null;
        }

        // only valid at start of content
        if (!isStartOfContent(sel.start, ctx)) {
            return null;
        }

        // determine if there is a previous sibling tag
        var selPrevTagStart = $.extend({}, sel.start);
        var ctxPrevTag = TokenUtils.getInitialContext(editor._codeMirror, selPrevTagStart);

        // move to the start tag
        while (TokenUtils.moveSkippingWhitespace(TokenUtils.movePrevToken, ctxPrevTag)) {
            if (ctxPrevTag.token.type === "tag" && htmlState(ctxPrevTag).state.name === "attrState") {
                break;
            }
        }

        // move to the end of previous tag
        while (TokenUtils.moveSkippingWhitespace(TokenUtils.movePrevToken, ctxPrevTag)) {
            if (ctxPrevTag.token.type === "tag bracket" && ctxPrevTag.token.string === "<") {
                break;
            }
        }

        // next non-whitespace token must be tag delimiter
        TokenUtils.moveSkippingWhitespace(TokenUtils.movePrevToken, ctxPrevTag);
        if (ctxPrevTag.token.type !== "tag bracket" || ctxPrevTag.token.string !== ">") {
            return null;
        }

        // next non-whitespace token must be tag
        TokenUtils.moveSkippingWhitespace(TokenUtils.movePrevToken, ctxPrevTag);
        if (ctxPrevTag.token.type !== "tag" || htmlState(ctxPrevTag).state.name !== "closeState") {
            return null;
        }

        // determine if previous tag is same as current tag.
        // TODO: if previous tag is joinable, auto-convert it to current tag, then join.
        var prevTagName = htmlState(ctxPrevTag).context.tagName.toLowerCase();
        if (tagName !== prevTagName) {
            // return a no-op edit to indicate that we handled keystroke so end tag is not partially deleted
            return noOpEdit(sel);
        }

        // move selection to previous token which is start of close tag
        TokenUtils.movePrevToken(ctxPrevTag);
        selPrevTagStart.ch = ctxPrevTag.token.start;

        // delete range
        return {
            edit: {text: "", start: selPrevTagStart, end: sel.end},
            selection: {start: sel.start, end: sel.start, primary: sel.primary, isBeforeEdit: true}
        };
    }

    function handleBlockTag(newTagName, isInsert, sel, ctx) {
        var oldTagName = htmlState(ctx).context.tagName.toLowerCase(),
            edits = [];

        if (newTagName === oldTagName) {
            // same as handling event, but we don't need to do anything
            return noOpEdit(sel);
        }

        // context is a different tag
        if (!isInsert && (isTextFormattingTag(oldTagName) || isHeadingTag(oldTagName))) {
            // convert existing block/header tag
            return queueEdits(edits, changeTagName(oldTagName, newTagName, sel));
        }

        // wrap new tag around selection
        return queueEdits(edits, wrapTagAroundSelection(newTagName, sel, true));
    }

    function handleInlineTag(newTagName, isInsert, sel, ctx) {
        var oldTagName = htmlState(ctx).context.tagName.toLowerCase(),
            edits = [];

        // if context is same tag, remove it
        if (newTagName === oldTagName) {
            return queueEdits(edits, changeTagName(oldTagName, "", sel));
        }

        // context is a different tag
        if (!isInsert && isInlineTag(oldTagName)) {
            // convert existing inline tag
            return queueEdits(edits, changeTagName(oldTagName, newTagName, sel));
        }

        // wrap new tag around selection
        return queueEdits(edits, wrapTagAroundSelection(newTagName, sel, false));
    }

    // 2015.02.21 sygnas
    function handleCustomTag(newTagName, isInsert, sel, ctx) {
        var edits = [];
        var newTagPair = newTagName.split("|");
        return queueEdits(edits, wrapTagAroundCustomTag(newTagPair, sel, false));
    }

    function getEdits(sel, keyCode, isInsert) {
        var ctx = TokenUtils.getInitialContext(editor._codeMirror, sel.start);

        // verify we're in HTML markup
        if (TokenUtils.getModeAt(editor._codeMirror, sel.start).name !== "html") {
            return null;
        }

        // verify IP is in valid position to insert tag
        if (htmlState(ctx).state.name !== "baseState") {
            return null;
        }

        // all functions called in switch statement return value indicating
        // whether any change was made for key, but we always want to return
        // true so no further processing is done
        switch (keyCode) {

        case KeyEvent.DOM_VK_RETURN:                // Enter
            return handleEnterKey(sel, ctx);

        case KeyEvent.DOM_VK_DELETE:                // Delete
            return handleDeleteKey(sel, ctx);

        case KeyEvent.DOM_VK_BACK_SPACE:            // Backspace
            return handleBackspaceKey(sel, ctx);

        default:
            // determine tag for IP
            // default is insert new tag; if shift key then convert existing tag
            var newTagName = getTagNameFromKeyCode(keyCode),
                tag        = data.markupTags[newTagName];

            if (!tag) {
                return null;
            } else if (tag.type === "block" || tag.type === "heading") {
                return handleBlockTag(newTagName, isInsert, sel, ctx);
            } else if (tag.type === "inline") {
                return handleInlineTag(newTagName, isInsert, sel, ctx);
            } else if (tag.type === "custom") {
                // 2015.02.21 sygnas
                return handleCustomTag(newTagName, isInsert, sel, ctx);
            }
        }

        return null;
    }

    function shouldIndent(keyCode) {
        switch (keyCode) {

        case KeyEvent.DOM_VK_RETURN:                // Enter
        case KeyEvent.DOM_VK_DELETE:                // Delete
        case KeyEvent.DOM_VK_BACK_SPACE:            // Backspace
            return true;

        default:
            // determine tag for IP
            // default is insert new tag; if shift key then convert existing tag
            var newTagName = getTagNameFromKeyCode(keyCode),
                tag        = data.markupTags[newTagName];

            if (!tag) {
                return false;
            } else if (tag.type === "block" || tag.type === "heading") {
                return true;
            } else if (tag.type === "inline") {
                return false;
            }
        }

        return false;
    }

    function handleKey(event, testDocument, testEditor) {
        // Diferentiate Ctrl key from Cmd key on mac platform
        var ctrlKey = (brackets.platform === "mac") ? event.metaKey : event.ctrlKey;
        
        // quick check for most common cases
        if (!ctrlKey || event.altKey) {
            // only cases we handle is ctrl with no alt and shift is optional
            return false;
        }

        // Ignore ctrl/cmd key by itself
        if (event.keyCode === KeyEvent.DOM_VK_CONTROL) {
            // Mac: DOM_VK_META?
            return false;
        }

        initDocument(testDocument, testEditor);
        if (!doc || !editor) {
            return false;
        }

        // Only applies to HTML documents
        if (!isHtmlDoc()) {
            return false;
        }

        var selections = editor.getSelections(),
            edits = [],
            indent = shouldIndent(event.keyCode);

        // get edits
        selections.forEach(function (sel) {
            queueEdits(edits, getEdits(sel, event.keyCode, !event.shiftKey));
        });

        // batch for single undo
        doc.batchOperation(function () {
            // perform edits
            selections = editor.document.doMultipleEdits(edits);
            editor.setSelections(selections);

            if (indent) {
                // indent lines with selections
                selections.forEach(function (sel) {
                    if (!sel.end || sel.start.line === sel.end.line) {
                    // The document is the one that batches operations, but we want to use
                    // CodeMirror's indent operation. So we need to use the document's own
                    // backing editor's CodeMirror to do the indentation.
                        doc._masterEditor._codeMirror.indentLine(sel.start.line);
                    }
                });
            }
        });

        return (edits.length > 0);
    }

    function _keydownHook(event) {
        if (handleKey(event)) {
            event.stopPropagation();
            event.preventDefault();
            return true;
        }
        
        // If we didn't handle it, let other global keydown hooks handle it.
        return false;
    }
    
    function initQuickMarkupMode() {
        var bracketsKeymap = KeyBindingManager.getKeymap(),
            modifier = (brackets.platform === "mac" ? "Cmd-" : "Ctrl-"),
            tagName;

        KeyBindingManager.addGlobalKeydownHook(_keydownHook);

        // Save copy for restoring. Extensions can be loaded on-the-fly,
        // so re-copy every time we're enabled
        origKeymap = $.extend(true, {}, bracketsKeymap);

        // Generate list of conflicting shortcuts
        for (tagName in data.markupTags) {
            if (data.markupTags.hasOwnProperty(tagName)) {
                // Check Cmd/Ctrl+key
                var shortcut = modifier + data.markupTags[tagName].shortcut.toUpperCase(),
                    keybinding = origKeymap[shortcut];
                if (keybinding) {
                    conflictingBindingsArray.push({
                        shortcut:  shortcut,
                        commandID: keybinding.commandID,
                        platform:  keybinding.platform
                    });
                }

                // Check Cmd/Ctrl+Shift+key
                shortcut = modifier + "Shift-" + data.markupTags[tagName].shortcut.toUpperCase();
                keybinding = origKeymap[shortcut];
                if (keybinding) {
                    conflictingBindingsArray.push({
                        shortcut:  shortcut,
                        commandID: keybinding.commandID,
                        platform:  keybinding.platform
                    });
                }
            }
        }

        // Remove conflicting shortcuts
        conflictingBindingsArray.forEach(function (binding) {
            KeyBindingManager.removeBinding(binding.shortcut, binding.platform);
        });

    }

    function clearQuickMarkupMode() {
        clearDocument();
        KeyBindingManager.removeGlobalKeydownHook(_keydownHook);

        // restore conflicting shortcuts
        conflictingBindingsArray.forEach(function (binding) {
            KeyBindingManager.addBinding(
                binding.commandID,
                [ binding.shortcut ],
                binding.platform
            );
        });

        // Memory cleanup
        conflictingBindingsArray = [];
        origKeymap = null;
    }

    function onResize() {
        var $qmContent = $quickMarkupPanel.find(".qm-content"),
            height = heightHeader,
            helpHeight = 0,
            tableElt;

        // auto-resize panel to height of content
        if (helpQuickMarkup) {
            tableElt = $qmContent.find("table").get(0);
            helpHeight = parseInt(window.getComputedStyle(tableElt, null).height, 10);
            height += helpHeight;
        }

        $qmContent.height(helpHeight);
        $quickMarkupPanel.height(height);
    }

    // Define the functions that Commands will execute
    function toggleQuickMarkupMode() {
        modeQuickMarkup = !modeQuickMarkup;

        if (cmdMarkup) {
            cmdMarkup.setChecked(modeQuickMarkup);
        }

        if (modeQuickMarkup) {
            // mode turned on: initialize data, show panel
            initQuickMarkupMode();
            $quickMarkupPanel.show();
            
        } else {
            // mode turned off: clear data, hide panel
            clearQuickMarkupMode();
            $quickMarkupPanel.hide();
        }
        WorkspaceManager.recomputeLayout();
    }

    // Unit testing only - enable with no UI
    function _enableQuickMarkupMode() {
        if (!modeQuickMarkup) {
            modeQuickMarkup = true;
            initQuickMarkupMode();
        }
    }

    // Unit testing only - disable with no UI
    function _disableQuickMarkupMode() {
        if (modeQuickMarkup) {
            modeQuickMarkup = false;
            clearQuickMarkupMode();
        }
    }

    function toggleQuickMarkupHelp() {
        // viewing help forces quick markup mode on
        if (!modeQuickMarkup) {
            modeQuickMarkup = true;
            cmdMarkup.setChecked(true);
            initQuickMarkupMode();
            $quickMarkupPanel.show();
        }
        
        helpQuickMarkup = !helpQuickMarkup;

        if (cmdHelp) {
            cmdHelp.setChecked(helpQuickMarkup);
        }

        onResize();
        WorkspaceManager.recomputeLayout();
    }

    function handleCurrentFileChange() {
        // clear these fields -- they get updated on next usage
        clearDocument();
    }

    function initPanel() {
        var msData = {};
        msData.keyString = (brackets.platform === "mac") ? "Cmd" : "Ctrl";
        var s = Mustache.render(panelHtml, msData);
        $(".content").append(s);

        $quickMarkupPanel = $("#quick-markup");

        // Add keys from json
        var $table = $quickMarkupPanel.find(".qm-content table"),
            cellData = {};

        cellData.keyString = msData.keyString;
        cellData.cells = [];

        function appendRow() {
            var row = Mustache.render(tableRowHtml, cellData);
            $table.append(row);
        }

        // Add row for every 3 tags
        _.forEach(data.markupTags, function (tag, id) {
            cellData.cells.push({key: tag.shortcut.toUpperCase(), tag: "<" + id + ">"});
            if (cellData.cells.length === 3) {
                appendRow();
                cellData.cells = [];
            }
        });

        // Last partial row
        if (cellData.cells.length > 0) {
            appendRow();
        }

        $quickMarkupPanel.hide();
    }

    // initialize extension
    function init() {
        ExtensionUtils.loadStyleSheet(module, "quick-markup.css");

        // Register command to toggle mode
        cmdMarkup = CommandManager.register("Quick Markup Mode", TOGGLE_QUICK_MARKUP, toggleQuickMarkupMode);
        if (cmdMarkup) {
            cmdMarkup.setChecked(modeQuickMarkup);
        }
    
        // Register command to toggle help
        cmdHelp = CommandManager.register("Quick Markup Help", TOGGLE_QUICK_MARKUP_HELP, toggleQuickMarkupHelp);
        if (cmdHelp) {
            cmdHelp.setChecked(helpQuickMarkup);
        }

        // Add command to end of edit menu, if it exists
        var edit_menu = Menus.getMenu(Menus.AppMenuBar.EDIT_MENU);
        if (edit_menu) {
            edit_menu.addMenuDivider();
            edit_menu.addMenuItem(TOGGLE_QUICK_MARKUP,      "Ctrl-M");
            edit_menu.addMenuItem(TOGGLE_QUICK_MARKUP_HELP, "Ctrl-Shift-M");
        }
    
        MainViewManager.on("currentFileChange", handleCurrentFileChange);
        $(window).on("resize", onResize);

        // Add the HTML UI
        initPanel();
    }

    // initialize
    init();

    // Unit Test API
    exports._disableQuickMarkupMode = _disableQuickMarkupMode;
    exports._enableQuickMarkupMode  = _enableQuickMarkupMode;
    exports._handleKey              = handleKey;
});
