# Codepoints for Visual Studio Code

This extension adds some commands for working with Unicode code points in your code.

## Commands

* **Show character details:** Show details about the character at the cursor (or all selected characters), similar to the `what-cursor-position` command in Emacs.  Shows the following information about each character:

  * `Character:`  The character itself as a JSON string literal.
  * `Byte offset:`  The byte offset of the start of the character from the beginning of the file.  (See note 1 below.)
  * `Char offset:`  The offset from the beginning of the file as a number of code points.  (See note 2 below.)
  * `Code point:`  The code point in Unicode notation.
  * `UTF-8:`  The bytes that make up the UTF-8 encoding of the character.
  * `JavaScript:`  The JavaScript representation of the character using Unicode escape sequences.

* **Go to byte offset:**  Move the cursor to a character position specified as a number of bytes from the start of the file.  If the specified byte offset is not at the boundary between two characters, the character in which the byte offset occurs is selected.  The offset may be entered as a decimal number or a hexadecimal number with a `0x` prefix.  If the input starts with `+` or `-`, the offset is interpreted relative to the current cursor position rather than the start of the file.  (See note 1 below.)

* **Go to character offset:**  Move the cursor to a character position specified as the number of code points from the start of the file.  Uses the same input format as *Go to byte offset*  (See note 2 below.)

* **Insert code point:**  Insert a specific code point.  Input is treated as decimal by default, but various hexadecimal notations are allowed, so for example the letter 'A' may be entered as `65`, `0x41`, `\u41`, `\x41`, or `U+41`.


## Notes

1. Visual Studio Code does not make the file encoding available to extensions, so the encoding is always assumed to be UTF-8.  Working with other encodings will yield incorrect results.

2. Line endings are always counted as a single character, even for files that use a CRLF sequence as a line ending, which is common on Windows.  This is allows consistent character offsets between Windows and other systems even when, for example, git automatically translates line endings to the platform's native convention.