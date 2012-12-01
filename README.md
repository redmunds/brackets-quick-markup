brackets-quick-markup
=====================

Brackets Extension that creates a quick markup mode 

## Overview

This is an Extension for [Brackets](https://github.com/adobe/brackets). 

## Features

This extension is accessed in Brackets using menu Edit &gt; Quick Markup Mode or Ctrl-M.

A minimal bottom panel is displayed to indicate you are in quick markup mode. A &quot;mode&quot;
is required because this extension uses a lot of keyboard shortcuts which conflict with
some Brackets standard shortcuts. All other Brackets commands and editing work as expected.

Quick Markup mode allows fast HTML markup generation as you type similar to what how a
rich text editor works. It was created with text formatting in mind, but could be extended
for any kind of markup. It currently only generates HTML.

Start adding markup by pressing Ctrl-P to create a paragraph using a &lt;p&gt; tag.
The tag will be wrapped around the currently selected &quot;raw&quot; text.

As you are typing, pressing Ctrl-Enter closes the current &lt;p&gt; tag and starts a new one.
To convert a &lt;p&gt; tag to a heading, where heading refers to any &lt;h1&gt; through
&lt;h6&gt; tag, press Ctrl-1 through Ctrl-6, respectively. At the end of a heading tag,
pressing Ctrl-Enter closes the heading tag, and then starts a new &lt;p&gt; tag,
as this is most likely what you'll want next.

You can also use Ctrl-Enter in the middle of a paragragh or heading to split the tag.
Pressing Ctrl-Delete at the end of the (inner) text of a &lt;p&gt;
or heading tag joins the tag with the following sibling (if tag is the same).
Pressing Ctrl-Backspace at the start of the (inner) text joins with the previous
tag in a similar manner.

Selecting text and pressing Ctrl-B applies a &lt;strong&gt; tag.
Pressing Ctrl-B again removes the &lt;strong&gt; tag.
There is similar behavior pressing Ctrl-I for &lt;em&gt;
and pressing Ctrl-D for &lt;del&gt;.

Resulting text is properly indented based on Brackets preferences and
the appropriate line end characters are inserted for the current operating system.

You can switch documents while in quick markup mode.

Shortcuts used to generate markup:

<table>
  <tr>
    <td><strong>Ctrl-Enter</strong></td>
    <td>Split Tag or Start New Tag</td>
  </tr>
  <tr>
    <td><strong>Ctrl-Delete</strong></td>
    <td>Join Next Sibling Tag</td>
  </tr>
  <tr>
    <td><strong>Ctrl-Backspace</strong></td>
    <td>Join Previous Sibling Tag</td>
  </tr>
  <tr>
    <td><strong>Ctrl-P</strong></td>
    <td>&lt;p&gt;</td>
  </tr>
  <tr>
    <td><strong>Ctrl-1..6</strong></td>
    <td>&lt;h1&gt;..&lt;h6&gt;</td>
  </tr>
  <tr>
    <td><strong>Ctrl-B</strong></td>
    <td>&lt;strong&gt;</td>
  </tr>
  <tr>
    <td><strong>Ctrl-I</strong></td>
    <td>&lt;em&gt;</td>
  </tr>
  <tr>
    <td><strong>Ctrl-D</strong></td>
    <td>&lt;del&gt;</td>
  </tr>
</table>

**Note:** Ctrl refers to Ctrl key on Windows or Cmd key on Mac.

Use Edit &gt; Quick Markup Mode Help or Ctrl-Shift-M to see a list of all shortcuts used by this extension.

There is a lot more that could be done with this extension.
Let me know what enhancements you would like.

## License

MIT-licensed -- see _main.js_ for details.
