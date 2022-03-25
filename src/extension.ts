import * as vscode from 'vscode';
import { Buffer } from 'buffer';

// Since VS Code doesn't expose the encoding of a TextDocument,
// we just always assume it's UTF-8.
const ENCODING = 'utf8';

// The URI scheme used for this extension.
const SCHEME = 'codepoints';

// Counter used for generating URIs.
let uriCounter = 0;

// Mapping from the path portion of a URI to the corresponding content.
const pathToContent = new Map<string, string[]>();

// Converts a number to hexadecimal, applying some heuristic to choose the
// number of leading zeros.  The result will be at least `minWidth` characters.
function hex(n: number, minWidth = 0) {
    let result = n.toString(16);
    while (result.length < minWidth || (result.length < 4 && result.length % 2 !== 0)) {
        result = '0' + result;
    }
    return result;
}

// The type of text where any CRLF ('\r\n') sequences have been converted
// to just LF ('`n`).
type LFText = string;

// Gets the text of a document, converting '\r\n' to '\n' if necessary.
function getDocText(doc: vscode.TextDocument, range: vscode.Range, maxLength?: number): LFText {
    let text = doc.getText(range).slice(0, maxLength);
    if (doc.eol === vscode.EndOfLine.CRLF) {
        if (text.match(/\r(?!\n)|(?<!\r)\n/)) {
            throw Error('File contains broken CRLF pairs');
        }
        text = text.replace(/\r\n/g, '\n');
    }
    return text;
}

// A pair of a character and byte offset in a file.
type Offsets = { char: number, byte: number };

// Gets the offsets correspond to a position in a text document.
function getOffsets(doc: vscode.TextDocument, pos: vscode.Position): Offsets {
    const text = getDocText(doc, new vscode.Range(new vscode.Position(0, 0), pos));
    const eolAdjustment = doc.eol === vscode.EndOfLine.CRLF ? pos.line : 0;
    return {
        byte: Buffer.from(text, ENCODING).length + eolAdjustment,
        char: [...text].length,
    };
}

// Advances `pos` in `doc` by `count` characters.
function advancePosition(pos: vscode.Position, doc: vscode.TextDocument, count = 1): vscode.Position | null {
    let { line: lineNum, character: colNum } = pos;
    let line = doc.lineAt(lineNum).text;
    for (let i = 0; i < count; i++) {
        if (colNum >= line.length) {
            lineNum++;
            colNum = 0;
            try {
                line = doc.lineAt(lineNum).text;
            } catch (_) {
                return null;
            }
        } else {
            const charCode = line.charCodeAt(colNum);
            if (0xd800 <= charCode && charCode < 0xdc00) {
                // The code point is represented as a Unicode surrogate pair.
                colNum += 2;
            } else {
                colNum++;
            }
        }
    }
    return new vscode.Position(lineNum, colNum);
}

// Details of a character/location in a text document corresponding to a single
// Unicode code point.
export type CharDetails = {
    // The character itself.  This string will have a length of 2 if it
    // represented in JavaScript as a surrogate pair.  Line endings are always
    // '\n' regardless of the line endings of the file.
    char: string,
    // The offset of the first byte of the character from the start of the
    // document.
    byteOffset: number,
    // The offset in characters from the start of the document.  Line endings
    // are always counted as a single character.
    charOffset: number,
    // The Unicode code point.
    codePoint: number,
    // The bytes used to represent the character in a file, assuming the
    // encoding is UTF-8.
    bytes: number[],
    // The JavaScript character code(s) of the character.  Has the same length
    // as `char`, except for CRLF line endings.
    charCodes: number[],
};

// Gets an iterator over the character details of `text`, assuming an EOL style
// of `eol` and starting offsets specified by `startOffsets`.
export function* iterCharDetails(text: LFText, eol: vscode.EndOfLine, startOffsets: Offsets): Iterable<CharDetails> {
    let { char: charOffset, byte: byteOffset } = startOffsets;
    for (const logicalChar of text) {
        const physicalChars = logicalChar === '\n' && eol === vscode.EndOfLine.CRLF
            ? '\r\n'
            : logicalChar;
        const codePoint = logicalChar.codePointAt(0)!;
        const bytes = [...Buffer.from(physicalChars, ENCODING)];
        const charCodes = [];
        for (const char of physicalChars) {
            for (let i = 0; i < char.length; i++) {
                charCodes.push(char.charCodeAt(i));
            }
        }
        yield {
            char: logicalChar,
            byteOffset,
            charOffset,
            codePoint,
            bytes,
            charCodes,
        };
        charOffset++;
        byteOffset += bytes.length;
    }
}

// Command to show character information for the selected character(s) in a
// document. This command creates a new text document to display its output.
async function showCharInfo(editor: vscode.TextEditor, _edit: vscode.TextEditorEdit) {
    const doc = editor.document;
    let range = editor.selection.with();
    if (range.isEmpty) {
        // Expand the range to include a single character.
        range = range.with({ end: advancePosition(range.start, doc)! });
    }
    const text = getDocText(doc, range, 1000);

    // Produce a human-readable represenation of the character details.
    const content: string[] = [
        `URI:  ${doc.uri}`,
        `Name: ${doc.fileName}`,
        '',
        'Warning!  Byte offsets will be incorrect if the file encoding is not UTF-8 or ASCII.',
        '',
    ];
    for (const d of iterCharDetails(text, doc.eol, getOffsets(doc, range.start))) {
        content.push(
            `Character:  ${JSON.stringify(d.char)}`,
            `Byte offset: ${d.byteOffset}`,
            `Char offset: ${d.charOffset}`,
            `Code point:  U+${hex(d.codePoint)}`,
            `UTF-8:       ${d.bytes.map(value => hex(value)).join(' ')}`,
            `JavaScript: "${d.charCodes.map(value => '\\u' + hex(value, 4)).join('')}"`,
            '',
        );
    }

    // Associate the content with a URI.
    ++uriCounter;
    const path = `Char Details ${uriCounter}`;
    const uri = vscode.Uri.from({ scheme: SCHEME, path });
    pathToContent.set(path, content);

    // Show the content in a new editor.
    const outputDoc = await vscode.workspace.openTextDocument(uri);
    const outputEditor = await vscode.window.showTextDocument(outputDoc, { preview: true });

    // Allow the content to be garbage collected when the editor closes.
    let disposable: vscode.Disposable;
    disposable = vscode.window.onDidChangeVisibleTextEditors(editors => {
        if (!editors.includes(outputEditor)) {
            pathToContent.delete(path);
            disposable.dispose();
        }
    });
}

// Information about a line or character in a TextDocument.
type LineInfo = { text: string, pos: vscode.Position, byteOffset: number, charOffset: number };
type CharInfo = { char: string, pos: vscode.Position, byteOffset: number, charOffset: number };

// Gets an iterator over the lines in a document.  Because computing byte and
// character offsets is potentially expensive, the `options` parameter allows
// either to be omitted.
//
// This function is used to speed up searching for a Position corresponding to
// an arbitrary character or byte offset by skipping over whole lines.
export function* iterLineStartPositions(
    doc: vscode.TextDocument,
    options: {
        omitByteOffset?: boolean,
        omitCharOffset?: boolean,
    } = {},
): Generator<LineInfo> {
    const lineEndBytes = doc.eol === vscode.EndOfLine.CRLF ? 2 : 1;
    let byteOffset = 0;
    let charOffset = 0;
    for (let lineNum = 0; lineNum < doc.lineCount; lineNum++) {
        const text = doc.lineAt(lineNum).text;
        yield { pos: new vscode.Position(lineNum, 0), text, byteOffset, charOffset };
        if (!options.omitByteOffset) {
            byteOffset += Buffer.from(text, ENCODING).length + lineEndBytes;
        }
        if (!options.omitCharOffset) {
            charOffset += [...text].length + 1;
        }
    }
}

// Gets and iterator over the characters in a document.  If `start` it
// specified, it is used as the starting point for iterator.
export function* iterCharPositions(doc: vscode.TextDocument, start?: LineInfo): Generator<CharInfo> {
    let { pos, byteOffset, charOffset } =
        start || { pos: new vscode.Position(0, 0), byteOffset: 0, charOffset: 0 };
    while (true) {
        let nextPos = advancePosition(pos, doc);
        if (!nextPos) {
            yield { char: '', pos, byteOffset, charOffset };
            return;
        }
        const char = doc.getText(new vscode.Range(pos, nextPos));
        yield { char, pos, byteOffset, charOffset };
        byteOffset += Buffer.from(char, ENCODING).length;
        charOffset++;
        pos = nextPos;
    }
}

// Given an iterable, returns a new iterator over the the current and next items
// of the underlying iterable.  The `next` field is defined for ever value
// yielded except the last one.
function* peeking<T>(iterable: Iterable<T>): Iterable<{ current: T, next?: T }> {
    let item: { current: T, next?: T } | undefined;
    for (const next of iterable) {
        if (item) {
            item.next = next;
            yield item;
        }
        item = { current: next };
    }
    if (item) {
        yield item;
    }
}

// Given an input parsing function and an error message, makes a validator
// function for `vscode.window.showInputBox`.
function makeValidator(parseFn: (input: string) => any, message: string): (input: string) => string | null {
    return input => parseFn(input) === null ? message : null;
}

function parseOffset(input: string): number | null {
    if (/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(input)) {
        return Number.parseInt(input);
    } else {
        return null;
    }
}

const validateOffset = makeValidator(parseOffset, 'Please enter a decimal or hexadecimal number.');

// Command to go to a specific byte offset.
export async function gotoByte(editor: vscode.TextEditor, _edit?: vscode.TextEditorEdit, args: any[] = []) {
    let [targetOffset] = args;
    if (typeof targetOffset !== 'number') {
        const input = await vscode.window.showInputBox({
            prompt: 'Enter UTF-8 byte offset.',
            validateInput: validateOffset,
        });
        targetOffset = parseOffset(input!)!;
    }

    const doc = editor.document;
    for (const lineInfo of peeking(iterLineStartPositions(doc, { omitCharOffset: true }))) {
        let prevPos = null;
        if (lineInfo.next !== undefined || lineInfo.next!.byteOffset > targetOffset) {
            for (const charInfo of iterCharPositions(doc, lineInfo.current)) {
                if (charInfo.byteOffset === targetOffset) {
                    editor.selection = new vscode.Selection(charInfo.pos, charInfo.pos);
                    return;
                } else if (charInfo.byteOffset > targetOffset) {
                    editor.selection = new vscode.Selection(prevPos || charInfo.pos, charInfo.pos);
                    return;
                }
                prevPos = charInfo.pos;
            }
        }
    }
}

// Command to go to a specific character offset.
export async function gotoChar(editor: vscode.TextEditor, _edit?: vscode.TextEditorEdit, args: any[] = []) {
    let [targetOffset] = args;
    if (typeof targetOffset !== 'number') {
        const input = await vscode.window.showInputBox({
            prompt: 'Enter character offset.',
            validateInput: validateOffset,
        });
        targetOffset = parseOffset(input!)!;
    }

    const doc = editor.document;
    for (const lineInfo of peeking(iterLineStartPositions(doc, { omitByteOffset: true }))) {
        let prevPos = null;
        if (lineInfo.next !== undefined || lineInfo.next!.charOffset > targetOffset) {
            for (const charInfo of iterCharPositions(doc, lineInfo.current)) {
                if (charInfo.charOffset >= targetOffset) {
                    editor.selection = new vscode.Selection(charInfo.pos, charInfo.pos);
                    return;
                }
                prevPos = charInfo.pos;
            }
        }
    }
}

function parseCodePoint(input: string): number | null {
    let match;
    if (/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(input)) {
        return Number.parseInt(input);
    } else if (match = /^(?:u\+|\\[ux])([0-9a-f]+)$/i.exec(input)) {
        return Number.parseInt(match[1], 16);
    } else {
        return null;
    }
}

// Command to insert a specific Unicode code point.
async function insertCodePoint(editor: vscode.TextEditor) {
    const input = await vscode.window.showInputBox({
        prompt: 'Enter code point.',
        validateInput: makeValidator(parseCodePoint, 'Enter a decimal number or U+..., \\u..., 0x..., etc.'),
    });
    const codePoint = parseCodePoint(input!)!;
    const str = String.fromCodePoint(codePoint);
    await editor.edit(edit => {
        for (const selection of editor.selections) {
            edit.replace(selection, str);
        }
    });
}

export function activate(context: vscode.ExtensionContext) {
    // Create a content provider.  This is necessary to create a new text
    // document with specified contents that VS Code won't try to save when it's
    // closed.
    const onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    const provider = new class implements vscode.TextDocumentContentProvider {
        onDidChange = onDidChangeEmitter.event;

        provideTextDocumentContent(uri: vscode.Uri): string {
            return pathToContent.get(uri.path)!.join('\n');
        }
    };

    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(SCHEME, provider),
        vscode.commands.registerTextEditorCommand('codepoints.showCharInfo', showCharInfo),
        vscode.commands.registerTextEditorCommand('codepoints.gotoChar', gotoChar),
        vscode.commands.registerTextEditorCommand('codepoints.gotoByte', gotoByte),
        vscode.commands.registerTextEditorCommand('codepoints.insertCodePoint', insertCodePoint),
    );

}

export function deactivate() { }
