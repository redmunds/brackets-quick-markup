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
        Editor              = brackets.getModule("editor/Editor").Editor,
        EditorManager       = brackets.getModule("editor/EditorManager"),
        ExtensionUtils      = brackets.getModule("utils/ExtensionUtils"),
        FileUtils           = brackets.getModule("file/FileUtils"),
        KeyBindingManager   = brackets.getModule("command/KeyBindingManager"),
        KeyEvent            = brackets.getModule("utils/KeyEvent"),
        Menus               = brackets.getModule("command/Menus"),
        TokenUtils          = brackets.getModule("utils/TokenUtils");

    var panelHtml           = require("text!templates/bottom-panel.html"),
        cmdMarkupId         = "redmunds.brackets-quick-markup.view.toggle-quick-markup",
        cmdHelpId           = "redmunds.brackets-quick-markup.view.toggle-quick-markup-help",
        modeQuickMarkup     = false,
        helpQuickMarkup     = false,
        heightHeader        = 30,
        cmdMarkup,
        cmdHelp,
        doc,
        docMode,
        editor,
        $quickMarkupPanel;

    var containerTagArray       = ["body", "div", "section", "article", "header", "footer", "li", "blockquote"],
        headingTagArray         = ["h1", "h2", "h3", "h4", "h5", "h6"],
        inlineTagArray          = ["del", "em", "strong"],
        textFormattingTagArray  = ["p", "h1", "h2", "h3", "h4", "h5", "h6", "li"];

    // Maintain a list of Ctrl/Cmd key bindings so we can determine conflicts
    // (so they can be disabled in Quick Markup mode). Conflicts are determined
    // whenever QM mode is entered so bindings of extensions installed during
    // session are captured. This will not capture bindings for extensions installed
    // while in QM mode! Bindings are restored when QM mode is exited.
    // 
    // Note: not sure why Ctrl+Enter is overridden correctly...
    var quickMarkupShortcuts = ["B", "D", "I", "L", "P", "1", "2", "3", "4", "5", "6"],
        conflictingBindingsArray = [],
        origKeymap;


    function initDocument() {
        doc     = DocumentManager.getCurrentDocument();
        editor  = EditorManager.getCurrentFullEditor();
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

    function isContainerTag(tagName) {
        return (containerTagArray.indexOf(tagName) !== -1);
    }

    function isHeadingTag(tagName) {
        return (headingTagArray.indexOf(tagName) !== -1);
    }

    function isInlineTag(tagName) {
        return (inlineTagArray.indexOf(tagName) !== -1);
    }

    function isTextFormattingTag(tagName) {
        return (textFormattingTagArray.indexOf(tagName) !== -1);
    }

    function getLineEnding() {
        return (FileUtils.getPlatformLineEndings() === FileUtils.LINE_ENDINGS_CRLF)
                ? "\r\n" : "\n";
    }

    function isIP(sel) {
        return (sel.start.ch === sel.end.ch && sel.start.line === sel.end.line);
    }

    function getTagNameFromKeyCode(keyCode) {
        switch (keyCode) {
        case KeyEvent.DOM_VK_L:
            return "li";
        case KeyEvent.DOM_VK_P:
            return "p";
        case KeyEvent.DOM_VK_1:
            return "h1";
        case KeyEvent.DOM_VK_2:
            return "h2";
        case KeyEvent.DOM_VK_3:
            return "h3";
        case KeyEvent.DOM_VK_4:
            return "h4";
        case KeyEvent.DOM_VK_5:
            return "h5";
        case KeyEvent.DOM_VK_6:
            return "h6";
        case KeyEvent.DOM_VK_B:
            return "strong";
        case KeyEvent.DOM_VK_I:
            return "em";
        case KeyEvent.DOM_VK_D:
            return "del";
        default:
            break;
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
        if (ctx.token.type === "tag" && ctx.token.string === ">") {
            // IP position column is at end of start tag.
            // verify previous token is open tag token.
            var openStr = "<" + htmlState(ctx).context.tagName.toLowerCase(),
                posTag = $.extend(true, {}, pos),
                ctxNext = TokenUtils.getInitialContext(editor._codeMirror, posTag);

            TokenUtils.movePrevToken(ctxNext);

            return (
                ctxNext.token.type === "tag" &&
                htmlState(ctxNext).state.name === "attrState" &&
                ctxNext.token.string === openStr
            );
        }

        return false;
    }

    // Determine if IP in tag is at end of content: <tag>content|</tag>
    function isEndOfContent(pos, ctx) {
        if (ctx.token.end === pos.ch && (ctx.token.type === null || ctx.token.type === "tag")) {
            // IP position column is at end of text string.
            // now verify next token is tag-close token.
            var closeStr = "</" + htmlState(ctx).context.tagName.toLowerCase(),
                posTag = $.extend(true, {}, pos),
                ctxNext = TokenUtils.getInitialContext(editor._codeMirror, posTag);

            TokenUtils.moveNextToken(ctxNext);
            
            return (
                ctxNext.token.type === "tag" &&
                htmlState(ctxNext).state.name === "closeState" &&
                ctxNext.token.string === closeStr
            );
        }

        return false;
    }

    function getTagRangeFromIP(tagName, sel) {
        // Go backwards to the start of the tag
        var tagRangeStart = $.extend({}, sel.start),
            tagRangeEnd   = $.extend({}, sel.end),
            ctx = TokenUtils.getInitialContext(editor._codeMirror, tagRangeStart),
            openStr = "<" + tagName;

        while (TokenUtils.moveSkippingWhitespace(TokenUtils.movePrevToken, ctx)) {
            if (ctx.token.type === "tag" && ctx.token.string === openStr) {
                // move 1 more token to get "<[tag]"
                TokenUtils.movePrevToken(ctx);
                break;
            }
        }

        // Go forward to the end of the tag
        var closeStr = "</" + tagName;
        ctx = TokenUtils.getInitialContext(editor._codeMirror, tagRangeEnd);

        while (TokenUtils.moveSkippingWhitespace(TokenUtils.moveNextToken, ctx)) {
            if (ctx.token.type === "tag" && ctx.token.string === closeStr) {
                // move 1 more token to get ">"
                TokenUtils.moveNextToken(ctx);
                break;
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
            return false;
        }

        // only search on "<h1" (for example) to preserve attributes
        oldTagStr = doc.getRange(selTag.start, selTag.end);
        if (oldTagStr.indexOf("<" + oldTagName) !== 0) {
            return false;
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
            return false;
        }
        
        newTagStr = newTagStr.substr(0, oldCloseTagIndex);
        if (newTagName !== "") {
            newTagStr += "</" + newTagName + ">";
        }

        // update document
        doc.replaceRange(newTagStr, selTag.start, selTag.end);

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
        editor.setSelection(sel.start, sel.end);

        return true;
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

        doc.replaceRange(insertString, sel.start, replSelEnd);

        // reset selection
        var selNewStart = $.extend({}, sel.start),
            selNewEnd   = $.extend({}, sel.end);
        if (isIP(sel)) {
            selNewStart.ch += openTag.length;
            selNewEnd.ch   += openTag.length;
            editor.setSelection(selNewStart, selNewEnd);

            if (isBlock) {
                // smart indent empty tag
                editor._codeMirror.indentLine(sel.start.line);
            }
        } else {
            selNewStart.ch += openTag.length;
            if (sel.start.line === sel.end.line) {
                selNewEnd.ch += openTag.length;
            }
            editor.setSelection(selNewStart, selNewEnd);

            if (isBlock) {
                // smart indent selection
                editor._codeMirror.indentSelection();
            }
        }
 
        return true;
    }

    function splitTag(tagName, sel) {
        var insertString = "</" + tagName + ">" + getLineEnding() +
                           "<" + tagName + ">";

        doc.replaceRange(insertString, sel.start);
        
        // smart indent line we just added
        editor._codeMirror.indentLine(sel.start.line + 1);
    }

    function handleEnterKey(sel, ctx) {
        // only operate on IP
        if (!isIP(sel)) {
            return false;
        }

        var tagName = htmlState(ctx).context.tagName.toLowerCase();

        // paragraph tag
        if (tagName === "p") {
            splitTag(tagName, sel);
            return true;
        }

        // heading tags
        if (isHeadingTag(tagName)) {

            // is IP at end of content?
            var isEOC = isEndOfContent(sel.start, ctx);

            splitTag(tagName, sel);

            if (isEOC) {
                // if IP is at end of heading tag when Ctrl-Enter is pressed, then
                // user is most likely typing, and wants a paragraph after heading. 
                sel = editor.getSelection();
                changeTagName(tagName, "p", sel);
            }

            return true;
        }

        // list item tag
        if (tagName === "li") {
            // LI - if empty, jump out of list, otherwise split
            splitTag(tagName, sel);
            return true;
        }

        return false;
    }

    function handleDeleteKey(sel, ctx) {
        // only operate on IP
        if (!isIP(sel)) {
            return false;
        }

        // determine if tag is joinable
        var tagName = htmlState(ctx).context.tagName.toLowerCase();
        if (!isTextFormattingTag(tagName)) {
            return false;
        }

        // only valid at end of content
        if (!isEndOfContent(sel.start, ctx)) {
            return false;
        }

        // determine if there is a next sibling tag
        var selNextTagEnd = $.extend({}, sel.end);
        var ctxNextTag = TokenUtils.getInitialContext(editor._codeMirror, selNextTagEnd);

        // move to the close tag
        while (TokenUtils.moveSkippingWhitespace(TokenUtils.moveNextToken, ctxNextTag)) {
            if (ctxNextTag.token.type === "tag" && htmlState(ctxNextTag).state.name === "baseState") {
                break;
            }
        }

        // next non-whitespace token must be open tag
        TokenUtils.moveSkippingWhitespace(TokenUtils.moveNextToken, ctxNextTag);
        if (ctxNextTag.token.type !== "tag" || htmlState(ctxNextTag).state.name !== "attrState") {
            return false;
        }

        // determine if next tag is same as current tag.
        // TODO: if next tag is joinable, auto-convert it to current tag, then join.
        var nextTagName = htmlState(ctxNextTag).tagName.toLowerCase();
        if (tagName !== nextTagName) {
            // indicate that we handled keystroke so end tag is not partially deleted
            return true;
        }

        // move selection to next token which is end of open tag
        TokenUtils.moveNextToken(ctxNextTag);

        // delete range
        doc.replaceRange("", sel.start, selNextTagEnd);

        return true;
    }

    function handleBackspaceKey(sel, ctx) {
        // only operate on IP
        if (!isIP(sel)) {
            return false;
        }

        // determine if tag is joinable
        var tagName = htmlState(ctx).context.tagName.toLowerCase();
        if (!isTextFormattingTag(tagName)) {
            return false;
        }

        // only valid at start of content
        if (!isStartOfContent(sel.start, ctx)) {
            return false;
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
            if (ctxPrevTag.token.type === "tag" && htmlState(ctxPrevTag).state.name === "baseState") {
                break;
            }
        }

        // next non-whitespace token must be tag
        TokenUtils.moveSkippingWhitespace(TokenUtils.movePrevToken, ctxPrevTag);
        if (ctxPrevTag.token.type !== "tag" || htmlState(ctxPrevTag).state.name !== "closeState") {
            return false;
        }

        // determine if previous tag is same as current tag.
        // TODO: if previous tag is joinable, auto-convert it to current tag, then join.
        var prevTagName = htmlState(ctxPrevTag).context.tagName.toLowerCase();
        if (tagName !== prevTagName) {
            // indicate that we handled keystroke so start tag is not partially deleted
            return true;
        }

        // move selection to previous token which is start of close tag
        TokenUtils.movePrevToken(ctxPrevTag);

        // delete range
        doc.replaceRange("", selPrevTagStart, sel.end);

        return true;
    }

    function handleBlockTag(keyCode, sel, ctx) {
        var newTagName = getTagNameFromKeyCode(keyCode),
            oldTagName = htmlState(ctx).context.tagName.toLowerCase();

        if (newTagName === oldTagName) {
            // same as handling event, but we don't need to do anything
            return true;
        }

        // IP
        if (isIP(sel)) {
            if (isContainerTag(oldTagName)) {
                // create empty tag
                return wrapTagAroundSelection(newTagName, sel, true);
                
            } else if (isTextFormattingTag(oldTagName)) {
                // convert old tag to new tag
                return changeTagName(oldTagName, newTagName, sel);
            }

        // selection
        } else {
            if (isContainerTag(oldTagName)) {
                // raw text - wrap tag around it
                return wrapTagAroundSelection(newTagName, sel, true);
            }
        }

        return false;
    }

    function handleInlineTag(keyCode, sel, ctx) {
        var newTagName = getTagNameFromKeyCode(keyCode),
            oldTagName = htmlState(ctx).context.tagName.toLowerCase();

        // if context is same tag, remove it
        if (newTagName === oldTagName) {
            return changeTagName(oldTagName, "", sel);
        }

        // context is a different tag, so wrap new tag around it
        return wrapTagAroundSelection(newTagName, sel, false);
    }

    function handleKey(event) {
        // Diferentiate Ctrl key from Cmd key on mac platform
        var ctrlKey = (brackets.platform === "mac") ? event.metaKey : event.ctrlKey;
        
        // quick check for most common cases
        if (!ctrlKey || event.altKey || event.shiftKey) {
            // only cases we handle is ctrl with no alt or shift
            return false;
        }

        // Ignore ctrl/cmd key by itself
        if (event.keyCode === KeyEvent.DOM_VK_CONTROL) {
            // Mac: DOM_VK_META?
            return false;
        }

        initDocument();
        if (!doc || !editor) {
            return false;
        }

        // Only applies to HTML documents
        if (!isHtmlDoc()) {
            return false;
        }

        // verify we're in HTML markup & determine tag for IP
        var sel = editor.getSelection(),
            ctx = TokenUtils.getInitialContext(editor._codeMirror, sel.start);

        if (TokenUtils.getModeAt(editor._codeMirror, sel.start).name !== "html") {
            return false;
        }

        // all functions called in switch statement return value indicating
        // whether any change was made for key, but we always want to return
        // true so no further processing is done
        switch (event.keyCode) {

        case KeyEvent.DOM_VK_RETURN:                // Enter
            handleEnterKey(sel, ctx);
            return true;

        case KeyEvent.DOM_VK_DELETE:                // Delete
            handleDeleteKey(sel, ctx);
            return true;

        case KeyEvent.DOM_VK_BACK_SPACE:            // Backspace
            handleBackspaceKey(sel, ctx);
            return true;

        case KeyEvent.DOM_VK_L:                     // li
        case KeyEvent.DOM_VK_P:                     // p
        case KeyEvent.DOM_VK_1:                     // h1
        case KeyEvent.DOM_VK_2:                     // h2
        case KeyEvent.DOM_VK_3:                     // h3
        case KeyEvent.DOM_VK_4:                     // h4
        case KeyEvent.DOM_VK_5:                     // h5
        case KeyEvent.DOM_VK_6:                     // h6
            handleBlockTag(event.keyCode, sel, ctx);
            return true;

        case KeyEvent.DOM_VK_B:                     // strong
        case KeyEvent.DOM_VK_I:                     // em
        case KeyEvent.DOM_VK_D:                     // del
            handleInlineTag(event.keyCode, sel, ctx);
            return true;
        }

        return false;
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
        var bracketsKeymap = KeyBindingManager.getKeymap();

        initDocument();
        KeyBindingManager.addGlobalKeydownHook(_keydownHook);

        // Save copy for restoring. Extensions can be loaded on-the-fly,
        // so re-copy every time we're enabled
        origKeymap = $.extend(true, {}, bracketsKeymap);

        // Generate list of conflicting shortcuts
        quickMarkupShortcuts.forEach(function (baseChar) {
            var shortcut = (brackets.platform === "mac" ? "Cmd-" : "Ctrl-") + baseChar,
                keybinding = origKeymap[shortcut];
            if (keybinding) {
                conflictingBindingsArray.push({
                    shortcut:  shortcut,
                    commandID: keybinding.commandID,
                    platform:  keybinding.platform
                });
            }
        });

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
        EditorManager.resizeEditor();
    }

    function toggleQuickMarkupHelp() {
        var $qmContent = $quickMarkupPanel.find(".qm-content"),
            height = heightHeader,
            helpHeight = 0,
            tableElt;

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

        // auto-resize panel to height of content
        if (helpQuickMarkup) {
            tableElt = $qmContent.find("table").get(0);
            helpHeight = parseInt(window.getComputedStyle(tableElt, null).height, 10);
            height += helpHeight;
        }

        $qmContent.height(helpHeight);
        $quickMarkupPanel.height(height);
        EditorManager.resizeEditor();
    }

    function onDocumentChange() {
        // clear these fields -- they get updated on next usage
        clearDocument();
    }

    // initialize extension
    function init() {
        ExtensionUtils.loadStyleSheet(module, "quick-markup.css");

        // Register command to toggle mode
        cmdMarkup = CommandManager.register("Quick Markup Mode", cmdMarkupId, toggleQuickMarkupMode);
        if (cmdMarkup) {
            cmdMarkup.setChecked(modeQuickMarkup);
        }
    
        // Register command to toggle help
        cmdHelp = CommandManager.register("Quick Markup Help", cmdHelpId, toggleQuickMarkupHelp);
        if (cmdHelp) {
            cmdHelp.setChecked(helpQuickMarkup);
        }

        // Add command to end of edit menu, if it exists
        var edit_menu = Menus.getMenu(Menus.AppMenuBar.EDIT_MENU);
        if (edit_menu) {
            edit_menu.addMenuDivider();
            edit_menu.addMenuItem(cmdMarkupId, "Ctrl-M");
            edit_menu.addMenuItem(cmdHelpId,   "Ctrl-Shift-M");
        }
    
        $(DocumentManager).on("currentDocumentChange", onDocumentChange);

        // Add the HTML UI
        var msData = {};
        msData.keyString = (brackets.platform === "mac") ? "Cmd" : "Ctrl";
        var s = Mustache.render(panelHtml, msData);
        $(".content").append(s);

        $quickMarkupPanel = $("#quick-markup");
        $quickMarkupPanel.hide();
    }

    // initialize
    init();
});
