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

/***

TODO:
- lists:
  - ordered, unordered, data?
  - nest, unnest
- Ctrl-Enter
  - if old tag is same as new tag, propagate classes applied to old tag to new tag
- <br>,<br/> tag? Ctrl-Shift-Enter
- <div>, <span>
- HTML5 <section>, with <header>, <article>, <footer>, ?
- &nbsp; and other entities?
- img?
- table?

***/


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
        indentUnit,
        indentWithTabs,
        $quickMarkupPanel;

    var containerTagArray       = ["body", "div"],
        headingTagArray         = ["h1", "h2", "h3", "h4", "h5", "h6"],
        inlineTagArray          = ["del", "em", "strong"],
        textFormattingTagArray  = ["p", "h1", "h2", "h3", "h4", "h5", "h6"];

    // TODO: would be cleaner to have a single keymap instead of fragmented arrays
    var conflictingShortcutsArray   = (brackets.platform === "mac") ? ["Cmd-D"] : ["Ctrl-D"],
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

    function initQuickMarkupMode() {
        var bracketsKeymap = KeyBindingManager.getKeymap();

        initDocument();
        indentWithTabs  = Editor.getUseTabChar();
        indentUnit      = Editor.getIndentUnit();

        // This is a one time setup, but all extensions may not be loaded
        // when init() is called, so wait until first usage
        if (!origKeymap) {
            // save copy for restoring
            origKeymap = $.extend(true, {}, bracketsKeymap);
        }

        // remove conflicting shortcuts
        conflictingShortcutsArray.forEach(function (shortcut) {
            KeyBindingManager.removeBinding(shortcut, brackets.platform);
        });
    }

    function clearQuickMarkupMode() {
        clearDocument();

        // restore conflicting shortcuts
        conflictingShortcutsArray.forEach(function (shortcut) {
            KeyBindingManager.addBinding(
                origKeymap[shortcut].commandID,
                [ shortcut ],
                brackets.platform
            );
        });
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

    function isHtmlDoc() {
        return (docMode && (docMode.indexOf("html") === 0));
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

    function getTagNameFromKeyCode(keyCode) {
        switch (keyCode) {
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

    // Determine if IP in tag is at start of content: <tag>|content</tag>
    function isStartOfContent(pos, ctx) {
        if (ctx.token.className === "tag" && ctx.token.string === ">") {
            // IP position column is at end of start tag.
            // verify previous token is open tag token.
            var openStr = "<" + ctx.token.state.htmlState.context.tagName.toLowerCase(),
                posTag = $.extend(true, {}, pos),
                ctxNext = TokenUtils.getInitialContext(editor._codeMirror, posTag);

            TokenUtils.movePrevToken(ctxNext);

            return (
                ctxNext.token.className === "tag" &&
                ctxNext.token.state.htmlState.type === "openTag" &&
                ctxNext.token.string === openStr
            );
        }

        return false;
    }

    // Determine if IP in tag is at end of content: <tag>content|</tag>
    function isEndOfContent(pos, ctx) {
        if (ctx.token.className === null && ctx.token.end === pos.ch) {
            // IP position column is at end of text string.
            // now verify next token is tag-close token.
            var closeStr = "</" + ctx.token.state.htmlState.context.tagName.toLowerCase(),
                posTag = $.extend(true, {}, pos),
                ctxNext = TokenUtils.getInitialContext(editor._codeMirror, posTag);

            TokenUtils.moveNextToken(ctxNext);
            
            return (
                ctxNext.token.className === "tag" &&
                ctxNext.token.state.htmlState.type === "closeTag" &&
                ctxNext.token.string === closeStr
            );
        }

        return false;
    }

    function getTagRangeFromIP(tagName, sel) {
        // Go backwards to the start of the tag
        var selTag = $.extend(true, {}, sel),
            ctx = TokenUtils.getInitialContext(editor._codeMirror, selTag.start),
            openStr = "<" + tagName;

        while (TokenUtils.moveSkippingWhitespace(TokenUtils.movePrevToken, ctx)) {
            if (ctx.token.className === "tag" && ctx.token.string === openStr) {
                // move 1 more token to get "<[tag]"
                TokenUtils.movePrevToken(ctx);
                break;
            }
        }

        // Go forward to the end of the tag
        var closeStr = "</" + tagName;
        ctx = TokenUtils.getInitialContext(editor._codeMirror, selTag.end);

        while (TokenUtils.moveSkippingWhitespace(TokenUtils.moveNextToken, ctx)) {
            if (ctx.token.className === "tag" && ctx.token.string === closeStr) {
                // move 1 more token to get ">"
                TokenUtils.moveNextToken(ctx);
                break;
            }
        }
        
        return selTag;
    }

    function changeTagName(oldTagName, newTagName, sel) {
        var selTag = getTagRangeFromIP(oldTagName, sel),
            oldTagStr = "",
            newTagStr = "",
            oldStartTagIndex;

        // verify tag selection is an not IP
        if (selTag.start.ch === selTag.end.ch && selTag.start.line === selTag.end.line) {
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
            insertString = openTag + selText + closeTag;

        doc.replaceRange(insertString, sel.start, sel.end);

        // reset selection
        var selNew = $.extend(true, {}, sel);
        if (sel.start.ch !== sel.end.ch || sel.start.line !== sel.end.line) {
            selNew.start.ch += openTag.length;
            if (sel.start.line === sel.end.line) {
                selNew.end.ch += openTag.length;
            }
            editor.setSelection(selNew.start, selNew.end);

            if (isBlock) {
                // smart indent selection
                editor._codeMirror.indentSelection();
            }
        } else {
            selNew.start.ch += openTag.length;
            selNew.end.ch   += openTag.length;
            editor.setSelection(selNew.start, selNew.end);

            if (isBlock) {
                // smart indent empty tag
                editor._codeMirror.indentLine(sel.start.line);
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
        if (sel.start.ch !== sel.end.ch || sel.start.line !== sel.end.line) {
            return false;
        }

        var tagName = ctx.token.state.htmlState.context.tagName.toLowerCase();

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
        if (sel.start.ch !== sel.end.ch || sel.start.line !== sel.end.line) {
            return false;
        }

        // determine if tag is joinable
        var tagName = ctx.token.state.htmlState.context.tagName.toLowerCase();
        if (!isTextFormattingTag(tagName)) {
            return false;
        }

        // only valid at end of content
        if (!isEndOfContent(sel.start, ctx)) {
            return false;
        }

        // determine if there is a next sibling tag
        var selNextTag = $.extend(true, {}, sel);
        var ctxNextTag = TokenUtils.getInitialContext(editor._codeMirror, selNextTag.end);

        // move to the close tag
        while (TokenUtils.moveSkippingWhitespace(TokenUtils.moveNextToken, ctxNextTag)) {
            if (ctxNextTag.token.className === "tag" && ctxNextTag.token.state.htmlState.type === "endTag") {
                break;
            }
        }

        // next non-whitespace token must be openTag
        TokenUtils.moveSkippingWhitespace(TokenUtils.moveNextToken, ctxNextTag);
        if (ctxNextTag.token.className !== "tag" || ctxNextTag.token.state.htmlState.type !== "openTag") {
            return false;
        }

        // determine if next tag is same as current tag.
        // TODO: if next tag is joinable, auto-convert it to current tag, then join.
        var nextTagName = ctxNextTag.token.state.htmlState.tagName.toLowerCase();
        if (tagName !== nextTagName) {
            // indicate that we handled keystroke so end tag is not partially deleted
            return true;
        }

        // move selection to next token which is end of openTag
        TokenUtils.moveNextToken(ctxNextTag);

        // delete range
        doc.replaceRange("", selNextTag.start, selNextTag.end);

        return true;
    }

    function handleBackspaceKey(sel, ctx) {
        // only operate on IP
        if (sel.start.ch !== sel.end.ch || sel.start.line !== sel.end.line) {
            return false;
        }

        // determine if tag is joinable
        var tagName = ctx.token.state.htmlState.context.tagName.toLowerCase();
        if (!isTextFormattingTag(tagName)) {
            return false;
        }

        // only valid at start of content
        if (!isStartOfContent(sel.start, ctx)) {
            return false;
        }

        // determine if there is a previous sibling tag
        var selPrevTag = $.extend(true, {}, sel);
        var ctxPrevTag = TokenUtils.getInitialContext(editor._codeMirror, selPrevTag.start);

        // move to the start tag
        while (TokenUtils.moveSkippingWhitespace(TokenUtils.movePrevToken, ctxPrevTag)) {
            if (ctxPrevTag.token.className === "tag" && ctxPrevTag.token.state.htmlState.type === "openTag") {
                break;
            }
        }

        // next non-whitespace token must be endTag
        TokenUtils.moveSkippingWhitespace(TokenUtils.movePrevToken, ctxPrevTag);
        if (ctxPrevTag.token.className !== "tag" || ctxPrevTag.token.state.htmlState.type !== "endTag") {
            return false;
        }

        // determine if previous tag is same as current tag.
        // TODO: if previous tag is joinable, auto-convert it to current tag, then join.
        var prevTagName = ctxPrevTag.token.state.htmlState.tagName.toLowerCase();
        if (tagName !== prevTagName) {
            // indicate that we handled keystroke so start tag is not partially deleted
            return true;
        }

        // move selection to before start of closeTag
        while (TokenUtils.moveSkippingWhitespace(TokenUtils.movePrevToken, ctxPrevTag)) {
            if (ctxPrevTag.token.className === null) {
                break;
            }
        }

        // delete range
        doc.replaceRange("", selPrevTag.start, selPrevTag.end);

        return true;
    }

    function handleBlockTag(keyCode, sel, ctx) {
        var newTagName = getTagNameFromKeyCode(keyCode),
            oldTagName = ctx.token.state.htmlState.context.tagName.toLowerCase();

        if (newTagName === oldTagName) {
            // same as handling event, but we don't need to do anything
            return true;
        }

        // selection
        if (sel.start.ch !== sel.end.ch || sel.start.line !== sel.end.line) {
            if (isContainerTag(oldTagName)) {
                // raw text - wrap tag around it
                return wrapTagAroundSelection(newTagName, sel, true);
            }

        // IP
        } else {
            if (isContainerTag(oldTagName)) {
                // create empty tag
                return wrapTagAroundSelection(newTagName, sel, true);
                
            } else if (isTextFormattingTag(oldTagName)) {
                // convert old tag to new tag
                return changeTagName(oldTagName, newTagName, sel);
            }
        }

        return false;
    }

    function handleInlineTag(keyCode, sel, ctx) {
        var newTagName = getTagNameFromKeyCode(keyCode),
            oldTagName = ctx.token.state.htmlState.context.tagName.toLowerCase();

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

    function onDocumentChange() {
        // clear these fields -- they get updated on next usage
        clearDocument();
    }

    // initialize extension
    function init() {
        window.document.body.addEventListener(
            "keydown",
            function (event) {
                // quick check to amke sure mode is on
                if (modeQuickMarkup && handleKey(event)) {
                    event.stopPropagation();
                    event.preventDefault();
                }
            },
            true
        );

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
