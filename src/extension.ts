import * as vscode from 'vscode';
import { Buffer } from 'buffer';

const UTF8 = 'utf8';
const SCHEME = 'char-utils';
let counter = 0;
const pathToContent = new Map<string, string[]>();

function hex(n: number, minWidth = 0) {
	let result = n.toString(16);
	while (result.length < minWidth || (result.length < 4 && result.length % 2 != 0)) {
		result = '0' + result;
	}
	return result;
}


function getDocText(doc: vscode.TextDocument, range: vscode.Range, maxLength?: number): string {
	let text = doc.getText(range).slice(0, maxLength);
	if (doc.eol === vscode.EndOfLine.CRLF) {
		if (text.match(/\r(?!\n)|(?<!\r)\n/)) {
			throw Error('File contains broken CRLF pairs');
		}
		text = text.replace('\r\n', '\n');
	}
	return text;
}

type Offsets = { char: number, byte: number };

function getOffsets(doc: vscode.TextDocument, pos: vscode.Position): Offsets {
	const text = getDocText(doc, new vscode.Range(new vscode.Position(0, 0), pos));
	const eolAdjustment = doc.eol === vscode.EndOfLine.CRLF ? pos.line : 0;
	return {
		byte: Buffer.from(text, UTF8).length + eolAdjustment,
		char: [...text].length,
	};
}

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

async function showCharInfo(editor: vscode.TextEditor, _edit: vscode.TextEditorEdit) {
	const doc = editor.document;
	let range = editor.selection.with();
	if (range.isEmpty) {
		// Expand the range to include a single character.
		range = range.with({ end: advancePosition(range.start, doc)! });
	}
	const text = getDocText(doc, range, 1000);
	const content: string[] = [
		`URI:  ${doc.uri}`,
		`Name: ${doc.fileName}`,
		'',
	];

	const offsets = getOffsets(doc, range.start);
	for (const logicalChar of text) {
		const physicalChars = logicalChar === '\n' && doc.eol === vscode.EndOfLine.CRLF
			? '\r\n'
			: logicalChar;
		const codePoint = logicalChar.codePointAt(0)!;
		const utf8 = [...Buffer.from(physicalChars, UTF8)];
		const charCodes = [];
		for (let i = 0; i < logicalChar.length; i++) {
			charCodes.push(logicalChar.charCodeAt(i));
		}
		content.push(
			`Character:  ${JSON.stringify(logicalChar)}`,
			`Byte offset: ${offsets.byte}`,
			`Char offset: ${offsets.char}`,
			`Code point:  U+${hex(codePoint)}`,
			`UTF-8:       ${utf8.map(value => hex(value)).join(' ')}`,
			`JavaScript: "${charCodes.map(value => '\\u' + hex(value, 4)).join('')}"`,
			'',
		);
		offsets.char++;
		offsets.byte += utf8.length;
	}

	++counter;
	const path = `Char Details ${counter}`;
	pathToContent.set(path, content);
	const uri = vscode.Uri.from({ scheme: SCHEME, path });
	const outputDoc = await vscode.workspace.openTextDocument(uri);
	doc.save();
	const outputEditor = await vscode.window.showTextDocument(outputDoc, { preview: true });

	let disposable: vscode.Disposable;
	disposable = vscode.window.onDidChangeVisibleTextEditors(editors => {
		if (!editors.includes(outputEditor)) {
			pathToContent.delete(path);
			disposable.dispose();
		}
	});
}

// TODO: Use iter... functions.
export async function gotoChar(editor: vscode.TextEditor, _edit?: vscode.TextEditorEdit, args: any[] = []) {
	let [targetOffset] = args;
	if (typeof targetOffset != 'number') {
		const input = await vscode.window.showInputBox({
			prompt: 'Enter character offset.'
		});
		targetOffset = Number.parseInt(input!);
	}
	const doc = editor.document;
	let lineNum = 0;
	let lineStartOffset = 0;
	while (true) {
		const line = doc.lineAt(lineNum).text;
		const lineEndOffset = lineStartOffset + [...line].length;
		if (lineEndOffset >= targetOffset) {
			const realColumn = targetOffset - lineStartOffset;
			let adjustedColumn = 0;
			let charCounter = 0;
			for (const char of line) {
				if (charCounter >= realColumn) break;
				adjustedColumn += char.length;
				++charCounter;
			}
			const pos = new vscode.Position(lineNum, adjustedColumn);
			editor.selection = new vscode.Selection(pos, pos);
			break;
		}
		lineStartOffset = lineEndOffset + 1;
		++lineNum;
	}
}

type LineInfo = { text: string, pos: vscode.Position, byteOffset: number, charOffset: number };
type CharInfo = { char: string, pos: vscode.Position, byteOffset: number, charOffset: number };

export function* iterLineStartPositions(doc: vscode.TextDocument): Generator<LineInfo> {
	const lineEndBytes = doc.eol === vscode.EndOfLine.CRLF ? 2 : 1;
	let byteOffset = 0;
	let charOffset = 0;
	for (let lineNum = 0; lineNum < doc.lineCount; lineNum++) {
		const text = doc.lineAt(lineNum).text;
		yield { pos: new vscode.Position(lineNum, 0), text, byteOffset, charOffset };
		byteOffset += Buffer.from(text, UTF8).length + lineEndBytes;
		charOffset += [...text].length + 1;
	}
}

export function* iterCharPositions(doc: vscode.TextDocument, lineInfo?: LineInfo): Generator<CharInfo> {
	let pos = lineInfo?.pos || new vscode.Position(0, 0);
	let byteOffset = lineInfo?.byteOffset || 0;
	let charOffset = lineInfo?.charOffset || 0;
	while (true) {
		let nextPos = advancePosition(pos, doc);
		if (!nextPos) {
			yield { char: '', pos, byteOffset, charOffset };
			return;
		}
		const char = doc.getText(new vscode.Range(pos, nextPos))
		yield { char, pos, byteOffset, charOffset };
		byteOffset += Buffer.from(char, UTF8).length;
		charOffset++;
		pos = nextPos;
	}
}

export async function gotoByte(editor: vscode.TextEditor, _edit?: vscode.TextEditorEdit, args: any[] = []) {
	let [targetOffset] = args;
	if (typeof targetOffset != 'number') {
		const input = await vscode.window.showInputBox({
			prompt: 'Enter UTF-8 byte offset.'
		});
		targetOffset = Number.parseInt(input!);
	}

	const doc = editor.document;
	let prevPos = null;
	for (const charInfo of iterCharPositions(doc)) {
		if (charInfo.byteOffset == targetOffset) {
			editor.selection = new vscode.Selection(charInfo.pos, charInfo.pos);
			break;
		} else if (charInfo.byteOffset > targetOffset) {
			editor.selection = new vscode.Selection(prevPos || charInfo.pos, charInfo.pos);
			break;
		}
		prevPos = charInfo.pos;
	}

	// console.log([...iterLineRanges(doc)]);
	// console.log([...iterCharPositions(doc, new vscode.Position(0,0), 0)]);
	// let lineNum = 0;
	// let lineStartOffset = 0;
	// const lineEndBytes = doc.eol === vscode.EndOfLine.CRLF ? 2 : 1;
	// while (true) {
	// 	const line = doc.lineAt(lineNum).text;
	// 	const lineEndOffset = lineStartOffset + Buffer.from(line, UTF8).length;
	// 	const nextLineStartOffset = lineEndOffset + lineEndBytes;
	// 	if (nextLineStartOffset > targetOffset) {
	// 		let byteIndex = lineStartOffset;
	// 		let realColumn = 0;
	// 		let adjustedColumn = 0;
	// 		let selectionWidth = 0;
	// 		for (const char of line + '\r\n') {
	// 			if (byteIndex == targetOffset) {
	// 				break;
	// 			}
	// 			const nextByteIndex = byteIndex + Buffer.from(char, UTF8).length;
	// 			if (nextByteIndex > targetOffset) {
	// 				selectionWidth = char.length;
	// 				break;
	// 			}
	// 			realColumn++;
	// 			adjustedColumn += char.length;
	// 			byteIndex = nextByteIndex;
	// 		}
	// 		const startPos = new vscode.Position(lineNum, adjustedColumn);
	// 		const endPos = advancePosition(startPos, doc, selectionWidth);
	// 		editor.selection = new vscode.Selection(startPos, endPos);
	// 		break;
	// 	}
	// 	lineStartOffset = nextLineStartOffset;
	// 	++lineNum;
	// }
}

export function activate(context: vscode.ExtensionContext) {
	const onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
	const provider = new class implements vscode.TextDocumentContentProvider {
		onDidChange = onDidChangeEmitter.event;

		provideTextDocumentContent(uri: vscode.Uri): string {
			return pathToContent.get(uri.path)!.join('\n');
		}
	};
	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(SCHEME, provider),
		vscode.commands.registerTextEditorCommand('char-utils.showCharInfo', showCharInfo),
		vscode.commands.registerTextEditorCommand('char-utils.gotoChar', gotoChar),
		vscode.commands.registerTextEditorCommand('char-utils.gotoByte', gotoByte),
	);

}

export function deactivate() { }
