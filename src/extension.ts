import * as vscode from 'vscode';
import { Buffer } from 'buffer';

// ASCII control codes
const CONTROL_CODES = [
	'NUL', 'SOH', 'STX', 'ETX', 'EOT', 'ENQ', 'ACK', 'BEL', 'BS', 'HT', 'LF',
	'VT', 'FF', 'CR', 'SO', 'SI', 'DLE', 'DC1', 'DC2', 'DC3', 'DC4', 'NAK',
	'SYN', 'ETB', 'CAN', 'EM', 'SUB', 'ESC', 'FS', 'GS', 'RS', 'US',
];

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

type Offsets = { char: number, byte: number };

function getDocText(doc: vscode.TextDocument, range: vscode.Range): string {
	let text = doc.getText(range);
	if (doc.eol === vscode.EndOfLine.CRLF) {
		text = text.replace('\r\n', '\n');
	}
	return text;
}

function getOffsets(doc: vscode.TextDocument, pos: vscode.Position): Offsets {
	const text = getDocText(doc, new vscode.Range(new vscode.Position(0,0), pos));
	const eolAdjustment = doc.eol === vscode.EndOfLine.CRLF ? pos.line : 0;
	return {
		byte: Buffer.from(text, 'utf8').length + eolAdjustment,
		char: [...text].length,
	};
	// let byte = 0;
	// let char = 0;
	// const eolBytes = doc.eol == vscode.EndOfLine.CRLF ? 2 : 1;
	// for (let i = 0; i < pos.line; i++) {
	// 	const line = doc.lineAt(i);
	// 	char += [...line.text].length + eolBytes;
	// 	byte += Buffer.from(line.text, 'utf8').length + eolBytes;
	// }
	// char += pos.character;
	// byte += Buffer.from(doc.lineAt(pos.line).text.slice(0, pos.character)).length;
	// return { char, byte };
}

async function showCharInfo(editor: vscode.TextEditor, _edit: vscode.TextEditorEdit) {
	let range = editor.selection.with();
	if (range.isEmpty) {
		range = range.with({ end: range.start.translate(0, 1) });
	}
	const doc = editor.document;
	const text = getDocText(doc, range).slice(0, 1000);
	const content: string[] = [
		`URI:  ${doc.uri}`,
		`Name: ${doc.fileName}`,
		'',
	];

	const offsets = getOffsets(doc, range.start);
	for (const logicalChar of text) {
		let physicalChars = logicalChar;
		if (logicalChar === '\n' && doc.eol === vscode.EndOfLine.CRLF) {
			physicalChars = '\r\n';
		}
		content.push(
			`Character:  ${JSON.stringify(logicalChar)}`,
			`Byte offset: ${offsets.byte}`,
			`Char offset: ${offsets.char}`,
		);
		const codePoint = logicalChar.codePointAt(0)!;
		const utf8 = [...Buffer.from(physicalChars, 'utf8')];
		offsets.char++;
		offsets.byte += utf8.length;
		content.push(
			`Code point:  U+${hex(codePoint)}`,
		);
		content.push(`UTF-8:       ${utf8.map(value => hex(value)).join(' ')}`)
		const charCodes = [];
		for (let i = 0; i < logicalChar.length; i++) {
			charCodes.push(logicalChar.charCodeAt(i));
		}
		content.push(`JavaScript: "${charCodes.map(value => '\\u' + hex(value, 4)).join('')}"`);
		content.push('');
	}

	++counter;
	const path = `Char Details ${counter}`;
	pathToContent.set(path, content);
	const uri = vscode.Uri.from({scheme: SCHEME, path});
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

export function activate(context: vscode.ExtensionContext) {
	const onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
	const provider = new class implements vscode.TextDocumentContentProvider {
		onDidChange = onDidChangeEmitter.event;

		provideTextDocumentContent(uri: vscode.Uri): string {
			return pathToContent.get(uri.path)!.join('\n');
		}
	};
	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(SCHEME, provider));
	context.subscriptions.push(
		vscode.commands.registerTextEditorCommand('char-utils.showCharInfo', showCharInfo));

}

export function deactivate() {}
