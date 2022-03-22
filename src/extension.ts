import * as vscode from 'vscode';
import { Buffer } from 'buffer';

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


function getDocText(doc: vscode.TextDocument, range: vscode.Range): string {
	let text = doc.getText(range);
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
		byte: Buffer.from(text, 'utf8').length + eolAdjustment,
		char: [...text].length,
	};
}

async function showCharInfo(editor: vscode.TextEditor, _edit: vscode.TextEditorEdit) {
	const doc = editor.document;
	let range = editor.selection.with();
	if (range.isEmpty) {
		// Expand the range to include a single character.  The case where the
		// cursor is at the end of the line is a little tricky.
		let end = doc.validatePosition(range.start.translate(0, 1));
		if (end.isEqual(range.start)) {
			end = new vscode.Position(end.line + 1, 0);
		}
		range = range.with({ end });
	}
	const text = getDocText(doc, range).slice(0, 1000);
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
		const utf8 = [...Buffer.from(physicalChars, 'utf8')];
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

export function deactivate() { }
