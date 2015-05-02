/*
 * Copyright (c) 2014 Adobe Systems Incorporated. All rights reserved.
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
 */

/*jslint vars: true, plusplus: true, devel: true, browser: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, describe, it, expect, beforeEach, afterEach, beforeFirst, afterLast, brackets */

define(function (require, exports, module) {
    "use strict";

    var QuickMarkup         = require("main");

    var KeyEvent            = brackets.getModule("utils/KeyEvent"),
        SpecRunnerUtils     = brackets.getModule("spec/SpecRunnerUtils");

    describe("Quick Markup", function () {

        var testDocument, testEditor;

        // Create a mockup editor with the given content
        function setupTest(content, languageId) {
            var mock = SpecRunnerUtils.createMockEditor(content, "html");
            testDocument = mock.doc;
            testEditor = mock.editor;
        }

        // Cleanup after `setupTest()`
        function tearDownTest() {
            SpecRunnerUtils.destroyMockEditor(testDocument);
            testEditor = null;
            testDocument = null;
        }

        beforeFirst(function () {
            QuickMarkup._enableQuickMarkupMode();
        });

        afterLast(function () {
            QuickMarkup._disableQuickMarkupMode();
        });

        function makeCtrlKeyEvent(keyCode, isShift) {
            var ctrlKey, metaKey;

            isShift = isShift || false;
            if (brackets.platform === "mac") {
                ctrlKey = false;
                metaKey = true;
            } else {
                ctrlKey = true;
                metaKey = false;
            }

            return {
                ctrlKey: ctrlKey,
                metaKey: metaKey,
                shiftKey: isShift,
                keyCode: keyCode,
                immediatePropagationStopped: false,
                propagationStopped: false,
                defaultPrevented: false,
                stopImmediatePropagation: function () {
                    this.immediatePropagationStopped = true;
                },
                stopPropagation: function () {
                    this.propagationStopped = true;
                },
                preventDefault: function () {
                    this.defaultPrevented = true;
                }
            };
        }

        describe("Split Tag", function () {

            var testContent =
                "<html>\n" +    // line 0
                "    <body>\n" +
                "        <h1>Top Header</h1>\n" +
                "        <p>intro</p>\n" +
                "        <h2 class='abc'>Sub Header</h2>\n" +
                "        <p class='xyz'>lorem ipsum</p>\n" +
                "        <p>lorem <strong>ipsum</strong> gypsum</p>\n" +
                "    </body>\n" +
                "<html>\n";

            beforeEach(function () {
                setupTest(testContent);
            });

            afterEach(function () {
                tearDownTest();
            });

            it("should split block formatting tag", function () {
                testEditor.setCursorPos({ line: 3, ch: 13 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_RETURN), testDocument, testEditor);
                expect(testDocument.getLine(3)).toEqual("        <p>in</p>");
                expect(testDocument.getLine(4)).toEqual("        <p>tro</p>");
                expect(testEditor.getCursorPos()).toEqual({ line: 4, ch: 11 });
            });

            it("should split heading tag", function () {
                testEditor.setCursorPos({ line: 2, ch: 16 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_RETURN), testDocument, testEditor);
                expect(testDocument.getLine(2)).toEqual("        <h1>Top </h1>");
                expect(testDocument.getLine(3)).toEqual("        <h1>Header</h1>");
                expect(testEditor.getCursorPos()).toEqual({ line: 3, ch: 12 });
            });

            it("should not split inline tag", function () {
                testEditor.setCursorPos({ line: 6, ch: 28 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_RETURN), testDocument, testEditor);
                expect(testDocument.getLine(6)).toEqual("        <p>lorem <strong>ipsum</strong> gypsum</p>");
                expect(testDocument.getLine(7)).toEqual("    </body>");
                expect(testEditor.getCursorPos()).toEqual({ line: 6, ch: 28 });
            });

            it("should not split with range selected", function () {
                testEditor.setSelection({ line: 3, ch: 11 }, { line: 3, ch: 16 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_RETURN), testDocument, testEditor);
                expect(testDocument.getLine(3)).toEqual("        <p>intro</p>");
                expect(testDocument.getLine(4)).toEqual("        <h2 class='abc'>Sub Header</h2>");
                expect(testEditor.getSelection()).toEqual({ start: { line: 3, ch: 11 }, end:  { line: 3, ch: 16 }, reversed: false });
            });

            it("should split block formatting tag and propagate attributes", function () {
                testEditor.setCursorPos({ line: 5, ch: 29 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_RETURN), testDocument, testEditor);
                expect(testDocument.getLine(5)).toEqual("        <p class='xyz'>lorem </p>");
                expect(testDocument.getLine(6)).toEqual("        <p class='xyz'>ipsum</p>");
                expect(testEditor.getCursorPos()).toEqual({ line: 6, ch: 23 });
            });

            it("should split heading tag and propagate attributes", function () {
                testEditor.setCursorPos({ line: 4, ch: 28 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_RETURN), testDocument, testEditor);
                expect(testDocument.getLine(4)).toEqual("        <h2 class='abc'>Sub </h2>");
                expect(testDocument.getLine(5)).toEqual("        <h2 class='abc'>Header</h2>");
                expect(testEditor.getCursorPos()).toEqual({ line: 5, ch: 24 });
            });

            it("should create <p> tag when splitting from end of heading tag", function () {
                testEditor.setCursorPos({ line: 2, ch: 22 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_RETURN), testDocument, testEditor);
                expect(testDocument.getLine(2)).toEqual("        <h1>Top Header</h1>");
                expect(testDocument.getLine(3)).toEqual("        <p></p>");
                expect(testEditor.getCursorPos()).toEqual({ line: 3, ch: 11 });

                // This takes multiple operations, so verify a single undo
                testEditor.undo();
                expect(testDocument.getLine(2)).toEqual("        <h1>Top Header</h1>");
                expect(testDocument.getLine(3)).toEqual("        <p>intro</p>");
                expect(testEditor.getCursorPos()).toEqual({ line: 2, ch: 22 });
            });

            it("should split multiple tags", function () {
                testEditor.setSelections(
                    [
                        { start: { line: 2, ch: 22 }, end: { line: 2, ch: 22 } },
                        { start: { line: 3, ch: 13 }, end: { line: 3, ch: 13 } },
                        { start: { line: 4, ch: 28 }, end: { line: 4, ch: 28 }, primary: true }
                    ]
                );
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_RETURN), testDocument, testEditor);
                expect(testDocument.getLine(2)).toEqual("        <h1>Top Header</h1>");
                expect(testDocument.getLine(3)).toEqual("        <p></p>");
                expect(testDocument.getLine(4)).toEqual("        <p>in</p>");
                expect(testDocument.getLine(5)).toEqual("        <p>tro</p>");
                expect(testDocument.getLine(6)).toEqual("        <h2 class='abc'>Sub </h2>");
                expect(testDocument.getLine(7)).toEqual("        <h2 class='abc'>Header</h2>");

                expect(testEditor.getSelections()).toEqual(
                    [
                        { start: { line: 3, ch: 11 }, end:  { line: 3, ch: 11 }, reversed: false, primary: false },
                        { start: { line: 5, ch: 11 }, end:  { line: 5, ch: 11 }, reversed: false, primary: false },
                        { start: { line: 7, ch: 24 }, end:  { line: 7, ch: 24 }, reversed: false, primary: true }
                    ]
                );

                // This takes multiple operations, so verify a single undo
                testEditor.undo();
                expect(testDocument.getLine(2)).toEqual("        <h1>Top Header</h1>");
                expect(testDocument.getLine(3)).toEqual("        <p>intro</p>");
                expect(testDocument.getLine(4)).toEqual("        <h2 class='abc'>Sub Header</h2>");

                expect(testEditor.getSelections()).toEqual(
                    [
                        { start: { line: 2, ch: 22 }, end:  { line: 2, ch: 22 }, reversed: false, primary: false },
                        { start: { line: 3, ch: 13 }, end:  { line: 3, ch: 13 }, reversed: false, primary: false },
                        { start: { line: 4, ch: 28 }, end:  { line: 4, ch: 28 }, reversed: false, primary: true }
                    ]
                );
            });
        });

        describe("Join Next Tag", function () {
            var testContent =
                "<html>\n" +
                "    <body>\n" +
                "        <h1>Top Header</h1>\n" +
                "        <p>Hello</p>\n" +
                "        <p>World</p>\n" +
                "        <p class='xyz'>lorem ipsum</p>\n" +
                "        <p>lorem <strong>ipsum</strong> <strong>gypsum</strong></p>\n" +
                "    </body>\n" +
                "<html>\n";

            beforeEach(function () {
                setupTest(testContent);
            });

            afterEach(function () {
                tearDownTest();
            });

            it("should join next block level tag", function () {
                testEditor.setCursorPos({ line: 3, ch: 16 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_DELETE), testDocument, testEditor);
                expect(testDocument.getLine(3)).toEqual("        <p>HelloWorld</p>");
                expect(testDocument.getLine(4)).toEqual("        <p class='xyz'>lorem ipsum</p>");
                expect(testEditor.getCursorPos()).toEqual({ line: 3, ch: 16 });
            });

            it("should join next block level tag with attributes", function () {
                testEditor.setCursorPos({ line: 4, ch: 16 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_DELETE), testDocument, testEditor);
                expect(testDocument.getLine(4)).toEqual("        <p>Worldlorem ipsum</p>");
                expect(testDocument.getLine(5)).toEqual("        <p>lorem <strong>ipsum</strong> <strong>gypsum</strong></p>");
                expect(testEditor.getCursorPos()).toEqual({ line: 4, ch: 16 });
            });

            it("should not join next tag when IP not at end of content", function () {
                testEditor.setCursorPos({ line: 3, ch: 11 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_DELETE), testDocument, testEditor);
                // In Brackets, delete event gets handled by editor and char is deleted, but handleKey is called directly here
                expect(testDocument.getLine(3)).toEqual("        <p>Hello</p>");
                expect(testDocument.getLine(4)).toEqual("        <p>World</p>");
                expect(testEditor.getCursorPos()).toEqual({ line: 3, ch: 11 });
            });

            it("should not join next tag when selection is a range", function () {
                testEditor.setSelection({ line: 3, ch: 13 }, { line: 3, ch: 16 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_DELETE), testDocument, testEditor);
                // In Brackets, delete event gets handled by editor and range is deleted, but handleKey is called directly here
                expect(testDocument.getLine(3)).toEqual("        <p>Hello</p>");
                expect(testDocument.getLine(4)).toEqual("        <p>World</p>");
                expect(testEditor.getSelection()).toEqual({ start: { line: 3, ch: 13 }, end:  { line: 3, ch: 16 }, reversed: false });
            });

            it("should not join next tag when it's a different type of tag", function () {
                testEditor.setCursorPos({ line: 2, ch: 22 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_DELETE), testDocument, testEditor);
                expect(testDocument.getLine(2)).toEqual("        <h1>Top Header</h1>");
                expect(testDocument.getLine(3)).toEqual("        <p>Hello</p>");
                expect(testEditor.getCursorPos()).toEqual({ line: 2, ch: 22 });
            });

            it("should not join next inlne tag", function () {
                testEditor.setCursorPos({ line: 6, ch: 30 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_DELETE), testDocument, testEditor);
                expect(testDocument.getLine(6)).toEqual("        <p>lorem <strong>ipsum</strong> <strong>gypsum</strong></p>");
                expect(testDocument.getLine(7)).toEqual("    </body>");
                expect(testEditor.getCursorPos()).toEqual({ line: 6, ch: 30 });
            });

            it("should join multiple next tags", function () {
                testEditor.setSelections(
                    [
                        { start: { line: 3, ch: 16 }, end: { line: 3, ch: 16 } },
                        { start: { line: 5, ch: 34 }, end: { line: 5, ch: 34 }, primary: true }
                    ]
                );
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_DELETE), testDocument, testEditor);
                expect(testDocument.getLine(3)).toEqual("        <p>HelloWorld</p>");
                expect(testDocument.getLine(4)).toEqual("        <p class='xyz'>lorem ipsumlorem <strong>ipsum</strong> <strong>gypsum</strong></p>");

                expect(testEditor.getSelections()).toEqual(
                    [
                        { start: { line: 3, ch: 16 }, end:  { line: 3, ch: 16 }, reversed: false, primary: false },
                        { start: { line: 4, ch: 34 }, end:  { line: 4, ch: 34 }, reversed: false, primary: true }
                    ]
                );

                testEditor.undo();
                expect(testDocument.getLine(3)).toEqual("        <p>Hello</p>");
                expect(testDocument.getLine(4)).toEqual("        <p>World</p>");
                expect(testDocument.getLine(5)).toEqual("        <p class='xyz'>lorem ipsum</p>");
                expect(testDocument.getLine(6)).toEqual("        <p>lorem <strong>ipsum</strong> <strong>gypsum</strong></p>");

                expect(testEditor.getSelections()).toEqual(
                    [
                        { start: { line: 3, ch: 16 }, end:  { line: 3, ch: 16 }, reversed: false, primary: false },
                        { start: { line: 5, ch: 34 }, end:  { line: 5, ch: 34 }, reversed: false, primary: true }
                    ]
                );
            });
        });

        describe("Join Previous Tag", function () {
            var testContent =
                "<html>\n" +
                "    <body>\n" +
                "        <h1>Top Header</h1>\n" +
                "        <p>Hello</p>\n" +
                "        <p>World</p>\n" +
                "        <p class='xyz'>lorem ipsum</p>\n" +
                "        <p>lorem <strong>ipsum</strong> <strong>gypsum</strong></p>\n" +
                "    </body>\n" +
                "<html>\n";

            beforeEach(function () {
                setupTest(testContent);
            });

            afterEach(function () {
                tearDownTest();
            });

            it("should join previous block level tag", function () {
                testEditor.setCursorPos({ line: 4, ch: 11 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_BACK_SPACE), testDocument, testEditor);
                expect(testDocument.getLine(3)).toEqual("        <p>HelloWorld</p>");
                expect(testDocument.getLine(4)).toEqual("        <p class='xyz'>lorem ipsum</p>");
                expect(testEditor.getCursorPos()).toEqual({ line: 3, ch: 16 });
            });

            it("should join previous block level tag with attributes", function () {
                testEditor.setCursorPos({ line: 5, ch: 23 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_BACK_SPACE), testDocument, testEditor);
                expect(testDocument.getLine(4)).toEqual("        <p>Worldlorem ipsum</p>");
                expect(testDocument.getLine(5)).toEqual("        <p>lorem <strong>ipsum</strong> <strong>gypsum</strong></p>");
                expect(testEditor.getCursorPos()).toEqual({ line: 4, ch: 16 });
            });

            it("should not join previous tag when IP not at beginning of content", function () {
                testEditor.setCursorPos({ line: 4, ch: 16 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_BACK_SPACE), testDocument, testEditor);
                // In Brackets, delete event gets handled by editor and char is deleted, but handleKey is called directly here
                expect(testDocument.getLine(3)).toEqual("        <p>Hello</p>");
                expect(testDocument.getLine(4)).toEqual("        <p>World</p>");
                expect(testEditor.getCursorPos()).toEqual({ line: 4, ch: 16 });
            });

            it("should not join previous tag when selection is a range", function () {
                testEditor.setSelection({ line: 3, ch: 13 }, { line: 3, ch: 16 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_BACK_SPACE), testDocument, testEditor);
                // In Brackets, delete event gets handled by editor and range is deleted, but handleKey is called directly here
                expect(testDocument.getLine(3)).toEqual("        <p>Hello</p>");
                expect(testDocument.getLine(4)).toEqual("        <p>World</p>");
                expect(testEditor.getSelection()).toEqual({ start: { line: 3, ch: 13 }, end:  { line: 3, ch: 16 }, reversed: false });
            });

            it("should not join previous tag when it's a different type of tag", function () {
                testEditor.setCursorPos({ line: 3, ch: 11 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_BACK_SPACE), testDocument, testEditor);
                expect(testDocument.getLine(2)).toEqual("        <h1>Top Header</h1>");
                expect(testDocument.getLine(3)).toEqual("        <p>Hello</p>");
                expect(testEditor.getCursorPos()).toEqual({ line: 3, ch: 11 });
            });

            it("should not join previous inlne tag", function () {
                testEditor.setCursorPos({ line: 6, ch: 48 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_BACK_SPACE), testDocument, testEditor);
                expect(testDocument.getLine(6)).toEqual("        <p>lorem <strong>ipsum</strong> <strong>gypsum</strong></p>");
                expect(testDocument.getLine(7)).toEqual("    </body>");
                expect(testEditor.getCursorPos()).toEqual({ line: 6, ch: 48 });
            });

            it("should join multiple previous tags", function () {
                testEditor.setSelections(
                    [
                        { start: { line: 4, ch: 11 }, end: { line: 4, ch: 11 } },
                        { start: { line: 6, ch: 11 }, end: { line: 6, ch: 11 }, primary: true }
                    ]
                );
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_BACK_SPACE), testDocument, testEditor);
                expect(testDocument.getLine(3)).toEqual("        <p>HelloWorld</p>");
                expect(testDocument.getLine(4)).toEqual("        <p class='xyz'>lorem ipsumlorem <strong>ipsum</strong> <strong>gypsum</strong></p>");

                expect(testEditor.getSelections()).toEqual(
                    [
                        { start: { line: 3, ch: 16 }, end:  { line: 3, ch: 16 }, reversed: false, primary: false },
                        { start: { line: 4, ch: 34 }, end:  { line: 4, ch: 34 }, reversed: false, primary: true }
                    ]
                );

                testEditor.undo();
                expect(testDocument.getLine(3)).toEqual("        <p>Hello</p>");
                expect(testDocument.getLine(4)).toEqual("        <p>World</p>");
                expect(testDocument.getLine(5)).toEqual("        <p class='xyz'>lorem ipsum</p>");
                expect(testDocument.getLine(6)).toEqual("        <p>lorem <strong>ipsum</strong> <strong>gypsum</strong></p>");

                expect(testEditor.getSelections()).toEqual(
                    [
                        { start: { line: 4, ch: 11 }, end:  { line: 4, ch: 11 }, reversed: false, primary: false },
                        { start: { line: 6, ch: 11 }, end:  { line: 6, ch: 11 }, reversed: false, primary: true }
                    ]
                );
            });
        });
        describe("Block formatting", function () {
            var testContent =
                "<html>\n" +
                "    <body>\n" +
                "        <h1>Top Header</h1>\n" +
                "        <p>Hello</p>\n" +
                "        World\n" +
                "        <p class='xyz'>lorem ipsum</p>\n" +
                "        \n" +
                "    </body>\n" +
                "<html>\n";

            beforeEach(function () {
                setupTest(testContent);
            });

            afterEach(function () {
                tearDownTest();
            });

            it("should insert block level tag at IP", function () {
                testEditor.setCursorPos({ line: 6, ch: 8 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_D), testDocument, testEditor);
                expect(testDocument.getLine(6)).toEqual("        <div></div>");
                expect(testEditor.getCursorPos()).toEqual({ line: 6, ch: 13 });
            });

            it("should insert block level tag at IP with attributes", function () {
                // 'attributes' property is currently not used in data.json, so temporarily set it
                var divTag = QuickMarkup._data.shortcuts.d,
                    attrs = divTag.attributes;
                divTag.attributes = "class='test'";

                testEditor.setCursorPos({ line: 6, ch: 8 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_D), testDocument, testEditor);
                expect(testDocument.getLine(6)).toEqual("        <div class='test'></div>");
                expect(testEditor.getCursorPos()).toEqual({ line: 6, ch: 26 });

                divTag.attributes = attrs;
            });

            it("should insert heading tag at IP", function () {
                testEditor.setCursorPos({ line: 6, ch: 8 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_3), testDocument, testEditor);
                expect(testDocument.getLine(6)).toEqual("        <h3></h3>");
                expect(testEditor.getCursorPos()).toEqual({ line: 6, ch: 12 });
            });

            it("should wrap block level tag around text", function () {
                testEditor.setSelection({ line: 4, ch: 8 }, { line: 4, ch: 13 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_D), testDocument, testEditor);
                expect(testDocument.getLine(4)).toEqual("        <div>World</div>");
                expect(testEditor.getSelection()).toEqual({ start: { line: 4, ch: 13 }, end:  { line: 4, ch: 18 }, reversed: false });
            });

            it("should wrap heading tag around text", function () {
                testEditor.setSelection({ line: 4, ch: 8 }, { line: 4, ch: 13 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_3), testDocument, testEditor);
                expect(testDocument.getLine(4)).toEqual("        <h3>World</h3>");
                expect(testEditor.getSelection()).toEqual({ start: { line: 4, ch: 12 }, end:  { line: 4, ch: 17 }, reversed: false });
            });

            it("should change block level tag containing IP", function () {
                testEditor.setCursorPos({ line: 2, ch: 16 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_2, true), testDocument, testEditor);
                expect(testDocument.getLine(2)).toEqual("        <h2>Top Header</h2>");
                expect(testEditor.getCursorPos()).toEqual({ line: 2, ch: 16 });
            });

            it("should change block level tag with attributes containing IP", function () {
                testEditor.setCursorPos({ line: 5, ch: 30 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_D, true), testDocument, testEditor);
                expect(testDocument.getLine(5)).toEqual("        <div class='xyz'>lorem ipsum</div>");
                expect(testEditor.getCursorPos()).toEqual({ line: 5, ch: 32 });
            });

            it("should change block level tag containing selection", function () {
                testEditor.setSelection({ line: 2, ch: 16 }, { line: 2, ch: 22 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_6, true), testDocument, testEditor);
                expect(testDocument.getLine(2)).toEqual("        <h6>Top Header</h6>");
                expect(testEditor.getSelection()).toEqual({ start: { line: 2, ch: 16 }, end:  { line: 2, ch: 22 }, reversed: false });
            });

            it("should change block level tag with attributes containing selection", function () {
                testEditor.setSelection({ line: 5, ch: 23 }, { line: 5, ch: 28 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_L, true), testDocument, testEditor);
                expect(testDocument.getLine(5)).toEqual("        <li class='xyz'>lorem ipsum</li>");
                expect(testEditor.getSelection()).toEqual({ start: { line: 5, ch: 24 }, end:  { line: 5, ch: 29 }, reversed: false });
            });

            it("should insert multiple block tags", function () {
                testEditor.setSelections(
                    [
                        { start: { line: 4, ch: 8 }, end: { line: 4, ch: 13 } },
                        { start: { line: 6, ch: 8 }, end: { line: 6, ch: 8  }, primary: true }
                    ]
                );
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_P), testDocument, testEditor);
                expect(testDocument.getLine(4)).toEqual("        <p>World</p>");
                expect(testDocument.getLine(6)).toEqual("        <p></p>");

                expect(testEditor.getSelections()).toEqual(
                    [
                        { start: { line: 4, ch: 11 }, end:  { line: 4, ch: 16 }, reversed: false, primary: false },
                        { start: { line: 6, ch: 11 }, end:  { line: 6, ch: 11 }, reversed: false, primary: true }
                    ]
                );

                testEditor.undo();
                expect(testDocument.getLine(4)).toEqual("        World");
                expect(testDocument.getLine(6)).toEqual("        ");

                expect(testEditor.getSelections()).toEqual(
                    [
                        { start: { line: 4, ch: 8 }, end:  { line: 4, ch: 13 }, reversed: false, primary: false },
                        { start: { line: 6, ch: 8 }, end:  { line: 6, ch: 8  }, reversed: false, primary: true }
                    ]
                );
            });
        });

        describe("Inline formatting", function () {
            var testContent =
                "<html>\n" +
                "    <body>\n" +
                "        <p></p>\n" +
                "        <p>Lorem ipsum dolor sit amet</p>\n" +
                "        <p>consectetur <em>adipiscing</em> <strong></strong></p>\n" +
                "    </body>\n" +
                "<html>\n";

            beforeEach(function () {
                setupTest(testContent);
            });

            afterEach(function () {
                tearDownTest();
            });

            it("should insert inline tag at IP", function () {
                testEditor.setCursorPos({ line: 2, ch: 11 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_B), testDocument, testEditor);
                expect(testDocument.getLine(2)).toEqual("        <p><strong></strong></p>");
                expect(testEditor.getCursorPos()).toEqual({ line: 2, ch: 19 });
            });

            it("should remove inline tag at IP", function () {
                testEditor.setCursorPos({ line: 4, ch: 51 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_B), testDocument, testEditor);
                expect(testDocument.getLine(4)).toEqual("        <p>consectetur <em>adipiscing</em> </p>");
                expect(testEditor.getCursorPos()).toEqual({ line: 4, ch: 43 });
            });

            it("should convert inline tag at IP", function () {
                testEditor.setCursorPos({ line: 4, ch: 51 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_I, true), testDocument, testEditor);
                expect(testDocument.getLine(4)).toEqual("        <p>consectetur <em>adipiscing</em> <em></em></p>");
                expect(testEditor.getCursorPos()).toEqual({ line: 4, ch: 47 });
            });

            it("should wrap inline tag around selection", function () {
                testEditor.setSelection({ line: 3, ch: 17 }, { line: 3, ch: 22 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_B), testDocument, testEditor);
                expect(testDocument.getLine(3)).toEqual("        <p>Lorem <strong>ipsum</strong> dolor sit amet</p>");
                expect(testEditor.getSelection()).toEqual({ start: { line: 3, ch: 25 }, end:  { line: 3, ch: 30 }, reversed: false });
            });

            it("should remove inline tag for selection", function () {
                testEditor.setSelection({ line: 4, ch: 27 }, { line: 4, ch: 37 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_I), testDocument, testEditor);
                expect(testDocument.getLine(4)).toEqual("        <p>consectetur adipiscing <strong></strong></p>");
                expect(testEditor.getSelection()).toEqual({ start: { line: 4, ch: 23 }, end:  { line: 4, ch: 33 }, reversed: false });
            });

            it("should convert inline tag for selection", function () {
                testEditor.setSelection({ line: 4, ch: 27 }, { line: 4, ch: 37 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_B, true), testDocument, testEditor);
                expect(testDocument.getLine(4)).toEqual("        <p>consectetur <strong>adipiscing</strong> <strong></strong></p>");
                expect(testEditor.getSelection()).toEqual({ start: { line: 4, ch: 31 }, end:  { line: 4, ch: 41 }, reversed: false });
            });

            it("should insert multiple inline tags", function () {
                testEditor.setSelections(
                    [
                        { start: { line: 3, ch: 11 }, end: { line: 3, ch: 16 } },
                        { start: { line: 3, ch: 29 }, end: { line: 3, ch: 32  }, primary: true }
                    ]
                );
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_I), testDocument, testEditor);
                expect(testDocument.getLine(3)).toEqual("        <p><em>Lorem</em> ipsum dolor <em>sit</em> amet</p>");

                expect(testEditor.getSelections()).toEqual(
                    [
                        { start: { line: 3, ch: 15 }, end:  { line: 3, ch: 20 }, reversed: false, primary: false },
                        { start: { line: 3, ch: 42 }, end:  { line: 3, ch: 45 }, reversed: false, primary: true }
                    ]
                );

                testEditor.undo();
                expect(testDocument.getLine(3)).toEqual("        <p>Lorem ipsum dolor sit amet</p>");

                expect(testEditor.getSelections()).toEqual(
                    [
                        { start: { line: 3, ch: 11 }, end:  { line: 3, ch: 16 }, reversed: false, primary: false },
                        { start: { line: 3, ch: 29 }, end:  { line: 3, ch: 32 }, reversed: false, primary: true }
                    ]
                );
            });
        });

        describe("Empty tags", function () {
            var testContent =
                "<html>\n" +
                "    <body>\n" +
                "        <p></p>\n" +
                "        <p>Lorem ipsum dolor sit amet</p>\n" +
                "        <p>consectetur<br/> adipiscing</p>\n" +
                "    </body>\n" +
                "<html>\n";

            beforeEach(function () {
                setupTest(testContent);
            });

            afterEach(function () {
                tearDownTest();
            });

            it("should insert empty tag at IP with trailing slash", function () {
                testEditor.setCursorPos({ line: 2, ch: 11 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_9), testDocument, testEditor);
                expect(testDocument.getLine(2)).toEqual("        <p><br/></p>");
                expect(testEditor.getCursorPos()).toEqual({ line: 2, ch: 16 });
            });

            it("should insert empty tag at IP without trailing slash", function () {
                // 'insertTrailingSlash':false is currently not used in data.json, so temporarily set it
                var brTag = QuickMarkup._data.shortcuts["9"],
                    trailingSlash = brTag.insertTrailingSlash;
                brTag.insertTrailingSlash = false;

                testEditor.setCursorPos({ line: 2, ch: 11 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_9), testDocument, testEditor);
                expect(testDocument.getLine(2)).toEqual("        <p><br></p>");
                expect(testEditor.getCursorPos()).toEqual({ line: 2, ch: 15 });

                brTag.insertTrailingSlash = trailingSlash;
            });

            it("should not convert empty tag at IP", function () {
                testEditor.setCursorPos({ line: 4, ch: 27 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_I, true), testDocument, testEditor);
                expect(testDocument.getLine(4)).toEqual("        <p>consectetur<br/><em></em> adipiscing</p>");
                expect(testEditor.getCursorPos()).toEqual({ line: 4, ch: 31 });
            });

            it("should not insert empty tag when range selected", function () {
                testEditor.setSelection({ line: 3, ch: 11 }, { line: 3, ch: 37 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_9), testDocument, testEditor);
                expect(testDocument.getLine(3)).toEqual("        <p>Lorem ipsum dolor sit amet</p>");
                expect(testEditor.getSelection()).toEqual({ start: { line: 3, ch: 11 }, end:  { line: 3, ch: 37 }, reversed: false });
            });

            it("should insert multiple empty tags", function () {
                testEditor.setSelections(
                    [
                        { start: { line: 3, ch: 22 }, end: { line: 3, ch: 22 } },
                        { start: { line: 3, ch: 32 }, end: { line: 3, ch: 32  }, primary: true }
                    ]
                );
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_9), testDocument, testEditor);
                expect(testDocument.getLine(3)).toEqual("        <p>Lorem ipsum<br/> dolor sit<br/> amet</p>");

                expect(testEditor.getSelections()).toEqual(
                    [
                        { start: { line: 3, ch: 27 }, end:  { line: 3, ch: 27 }, reversed: false, primary: false },
                        { start: { line: 3, ch: 42 }, end:  { line: 3, ch: 42 }, reversed: false, primary: true }
                    ]
                );
            });
        });

        describe("Source formatting", function () {
            var testContent =
                "<html>\n" +
                "    <body>\n" +
                "    <h1>Top Header</h1>\n" +
                "    <p>Hello</p>\n" +
                "    World\n" +
                "    <p>Lorem <strong>ipsum</strong> dolor</p>\n" +
                "\n" +
                "    </body>\n" +
                "<html>\n";

            beforeEach(function () {
                setupTest(testContent);
            });

            afterEach(function () {
                tearDownTest();
            });

            it("should insert block level tag at IP and properly indent line", function () {
                testEditor.setCursorPos({ line: 6, ch: 0 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_D), testDocument, testEditor);
                expect(testDocument.getLine(6)).toEqual("        <div></div>");
                expect(testEditor.getCursorPos()).toEqual({ line: 6, ch: 13 });
            });

            it("should wrap block level tag around text and properly indent line", function () {
                testEditor.setSelection({ line: 4, ch: 4 }, { line: 4, ch: 9 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_D), testDocument, testEditor);
                expect(testDocument.getLine(4)).toEqual("        <div>World</div>");
                expect(testEditor.getSelection()).toEqual({ start: { line: 4, ch: 13 }, end:  { line: 4, ch: 18 }, reversed: false });
            });

            it("should change block level tag containing IP and properly indent line", function () {
                testEditor.setCursorPos({ line: 2, ch: 12 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_2, true), testDocument, testEditor);
                expect(testDocument.getLine(2)).toEqual("        <h2>Top Header</h2>");
                expect(testEditor.getCursorPos()).toEqual({ line: 2, ch: 16 });
            });

            it("should insert inline tag at IP and not change indenting", function () {
                testEditor.setCursorPos({ line: 3, ch: 7 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_B), testDocument, testEditor);
                expect(testDocument.getLine(3)).toEqual("    <p><strong></strong>Hello</p>");
                expect(testEditor.getCursorPos()).toEqual({ line: 3, ch: 15 });
            });

            it("should convert inline tag at IP and not change indenting", function () {
                testEditor.setCursorPos({ line: 5, ch: 23 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_I, true), testDocument, testEditor);
                expect(testDocument.getLine(5)).toEqual("    <p>Lorem <em>ipsum</em> dolor</p>");
                expect(testEditor.getCursorPos()).toEqual({ line: 5, ch: 19 });
            });

            it("should wrap inline tag around selection and not change indenting", function () {
                testEditor.setSelection({ line: 5, ch: 36 }, { line: 5, ch: 41 });
                QuickMarkup._handleKey(makeCtrlKeyEvent(KeyEvent.DOM_VK_I), testDocument, testEditor);
                expect(testDocument.getLine(5)).toEqual("    <p>Lorem <strong>ipsum</strong> <em>dolor</em></p>");
                expect(testEditor.getSelection()).toEqual({ start: { line: 5, ch: 40 }, end:  { line: 5, ch: 45 }, reversed: false });
            });
        });
    });
});

