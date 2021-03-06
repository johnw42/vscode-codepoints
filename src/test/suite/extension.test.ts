import * as assert from 'assert';
import * as vscode from 'vscode';
import * as ext from '../../extension';
import * as path from 'path';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	const docs = new Map<string, vscode.TextDocument>();

	suiteSetup(async () => {
		const testDir = path.resolve(__dirname, '../../../src/test/suite');
		for (const filename of ['windows.txt', 'unix.txt']) {
			docs.set(filename, await vscode.workspace.openTextDocument(path.join(testDir, filename)));

		}
	});

	function testIterCharDetails(eol: vscode.EndOfLine, expected: ext.CharDetails[]) {
		const text = 'a\nbæΩ😀x\nc';
		assert.deepStrictEqual(
			[...ext.iterCharDetails(text, eol, { byte: 0, char: 0 })],
			expected,
		);
	}

	test('iterCharDetails for Windows', () => {
		testIterCharDetails(
			vscode.EndOfLine.CRLF,
			[
				{
					char: "a",
					byteOffset: 0,
					charOffset: 0,
					codePoint: 0x61,
					bytes: [0x61],
					charCodes: [0x61],
				},
				{
					char: "\n",
					byteOffset: 1,
					charOffset: 1,
					codePoint: 0x0a,
					bytes: [0x0d, 0x0a],
					charCodes: [0x0d, 0x0a],
				},
				{
					char: "b",
					byteOffset: 3,
					charOffset: 2,
					codePoint: 0x62,
					bytes: [0x62],
					charCodes: [0x62],
				},
				{
					char: "\u001b",
					byteOffset: 4,
					charOffset: 3,
					codePoint: 0x1b,
					bytes: [0x1b],
					charCodes: [0x1b],
				},
				{
					char: "æ",
					byteOffset: 5,
					charOffset: 4,
					codePoint: 0xe6,
					bytes: [0xc3, 0xa6],
					charCodes: [0xe6]
				},
				{
					char: "Ω",
					byteOffset: 7,
					charOffset: 5,
					codePoint: 0x3a9,
					bytes: [0xce, 0xa9],
					charCodes: [0x3a9],
				},
				{
					char: "😀",
					byteOffset: 9,
					charOffset: 6,
					codePoint: 0x1f600,
					bytes: [0xf0, 0x9f, 0x98, 0x80],
					charCodes: [0xd83d, 0xde00],
				},
				{
					char: "x",
					byteOffset: 13,
					charOffset: 7,
					codePoint: 0x78,
					bytes: [0x78],
					charCodes: [0x78],
				},
				{
					char: "\n",
					byteOffset: 14,
					charOffset: 8,
					codePoint: 0x0a,
					bytes: [0x0d, 0x0a],
					charCodes: [0x0d, 0x0a],
				},
				{
					char: "c",
					byteOffset: 16,
					charOffset: 9,
					codePoint: 0x63,
					bytes: [0x63],
					charCodes: [0x63],
				}
			]
		);
	});

	test('iterCharDetails for Unix', () => {
		testIterCharDetails(
			vscode.EndOfLine.LF,
			[
				{
					char: "a",
					byteOffset: 0,
					charOffset: 0,
					codePoint: 0x61,
					bytes: [0x61],
					charCodes: [0x61],
				},
				{
					char: "\n",
					byteOffset: 1,
					charOffset: 1,
					codePoint: 0x0a,
					bytes: [0x0a],
					charCodes: [0x0a],
				},
				{
					char: "b",
					byteOffset: 2,
					charOffset: 2,
					codePoint: 0x62,
					bytes: [0x62],
					charCodes: [0x62],
				},
				{
					char: "\u001b",
					byteOffset: 3,
					charOffset: 3,
					codePoint: 0x1b,
					bytes: [0x1b],
					charCodes: [0x1b],
				},
				{
					char: "æ",
					byteOffset: 4,
					charOffset: 4,
					codePoint: 0xe6,
					bytes: [0xc3, 0xa6],
					charCodes: [0xe6],
				},
				{
					char: "Ω",
					byteOffset: 6,
					charOffset: 5,
					codePoint: 0x3a9,
					bytes: [0xce, 0xa9],
					charCodes: [0x3a9],
				},
				{
					char: "😀",
					byteOffset: 8,
					charOffset: 6,
					codePoint: 0x1f600,
					bytes: [0xf0, 0x9f, 0x98, 0x80],
					charCodes: [0xd83d, 0xde00],
				},
				{
					char: "x",
					byteOffset: 12,
					charOffset: 7,
					codePoint: 0x78,
					bytes: [0x78],
					charCodes: [0x78],
				},
				{
					char: "\n",
					byteOffset: 13,
					charOffset: 8,
					codePoint: 0x0a,
					bytes: [0x0a],
					charCodes: [0x0a],
				},
				{
					char: "c",
					byteOffset: 14,
					charOffset: 9,
					codePoint: 0x63,
					bytes: [0x63],
					charCodes: [0x63],
				}
			]
		);
	});

	for (const isRelative of [false, true]) {
		for (const filename of ['windows.txt', 'unix.txt']) {
			test(`gotoChar in ${filename} where isRelative = ${isRelative}`, async () => {
				const doc = docs.get(filename)!;
				const editor = await vscode.window.showTextDocument(doc);
				const data: any[] = [
					{ line: 0, col: 0 },
					{ line: 0, col: 1 },
					{ line: 1, col: 0 },
					{ line: 1, col: 1 },
					{ line: 1, col: 2 },
					{ line: 1, col: 3 },
					{ line: 1, col: 4 },
					{ line: 1, col: 6 },
					{ line: 1, col: 7 },
					{ line: 2, col: 0 },
					{ line: 2, col: 1 },
				];
				let i = 0;
				for (const expectedPos of data) {
					let offset = i;
					if (isRelative) {
						const start = Math.floor(offset / 2);
						offset -= start;
						await ext.gotoChar(editor, undefined, [{ isRelative: false, value: start }])
					}
					await ext.gotoChar(editor, undefined, [{ isRelative, value: offset }]);
					assert.strictEqual(editor.selections.length, 1, 'too many selections');
					assert.ok(editor.selection.isEmpty, 'selection is not empty');
					const actualPos = {
						line: editor.selection.start.line,
						col: editor.selection.start.character,
					};
					assert.deepStrictEqual(actualPos, expectedPos, `error at position ${i}`);
					i++;
				}
			});
		}
	}

	async function testGotoByte(filename: string, isRelative: boolean, lineStarts: number[], expectedRanges: any[]) {
		lineStarts.sort();
		lineStarts.reverse();
		const doc = docs.get(filename)!;
		const editor = await vscode.window.showTextDocument(doc);
		let i = 0;
		for (let expectedRange of expectedRanges) {
			let offset = i;
			if (isRelative) {
				const start = lineStarts.find(x => x <= offset)!;
				offset -= start;
				await ext.gotoByte(editor, undefined, [{ isRelative: false, value: start }])
			}
			await ext.gotoByte(editor, undefined, [{ isRelative, value: offset }]);
			assert.strictEqual(editor.selections.length, 1, 'too many selections');
			expectedRange = {
				...{
					line2: expectedRange.line1,
					col2: expectedRange.col1,
				},
				...expectedRange,
			};
			const actualRange = {
				line1: editor.selection.start.line,
				col1: editor.selection.start.character,
				line2: editor.selection.end.line,
				col2: editor.selection.end.character,
			};
			assert.deepStrictEqual(actualRange, expectedRange, `error at position ${i}`);
			i++;
		}
	}

	for (const isRelative of [false, true]) {
		test(`gotoByte in windows.txt where isRelative = ${isRelative}`, async () => {
			await testGotoByte('windows.txt', isRelative, [0, 3, 15], [
				{ line1: 0, col1: 0 }, // a
				{ line1: 0, col1: 1 }, // CR
				{ line1: 0, col1: 1, line2: 1, col2: 0 }, // LF
				{ line1: 1, col1: 0 }, // b
				{ line1: 1, col1: 1 }, // ESC
				{ line1: 1, col1: 2 }, // æ
				{ line1: 1, col1: 2, col2: 3 }, // æ
				{ line1: 1, col1: 3 }, // Ω
				{ line1: 1, col1: 3, col2: 4 }, // Ω
				{ line1: 1, col1: 4 }, // 😀
				{ line1: 1, col1: 4, col2: 6 }, // 😀
				{ line1: 1, col1: 4, col2: 6 }, // 😀
				{ line1: 1, col1: 4, col2: 6 }, // 😀
				{ line1: 1, col1: 6 }, // x
				{ line1: 1, col1: 7 }, // CR
				{ line1: 1, col1: 7, line2: 2, col2: 0 }, // LF
				{ line1: 2, col1: 0 }, // c
				{ line1: 2, col1: 1 }, // EOF
			]);
		});

		test(`gotoByte in unix.txt where isRelative = ${isRelative}`, async () => {
			await testGotoByte('unix.txt', isRelative, [0, 2, 13], [
				{ line1: 0, col1: 0 }, // a
				{ line1: 0, col1: 1 }, // LF
				{ line1: 1, col1: 0 }, // b
				{ line1: 1, col1: 1 }, // ESC
				{ line1: 1, col1: 2 }, // æ
				{ line1: 1, col1: 2, col2: 3 }, // æ
				{ line1: 1, col1: 3 }, // Ω
				{ line1: 1, col1: 3, col2: 4 }, // Ω
				{ line1: 1, col1: 4 }, // 😀
				{ line1: 1, col1: 4, col2: 6 }, // 😀
				{ line1: 1, col1: 4, col2: 6 }, // 😀
				{ line1: 1, col1: 4, col2: 6 }, // 😀
				{ line1: 1, col1: 6 }, // x
				{ line1: 1, col1: 7 }, // LF
				{ line1: 2, col1: 0 }, // c
				{ line1: 2, col1: 1 }, // EOF
			]);
		});
	}

	function testIterLineStartPositions(filename: string, expectedLines: any[]) {
		const doc = docs.get(filename)!;

		let i = 0;
		for (const info of ext.iterLineStartPositions(doc)) {
			const expectedLine = expectedLines[i];
			const actualLine = {
				byteOffset: info.byteOffset,
				charOffset: info.charOffset,
			};
			assert.deepStrictEqual(actualLine, expectedLine, `error at position ${i}`);
			i++;
		}
	}

	test('iterLineStartPositions in windows.txt', () => {
		testIterLineStartPositions('windows.txt', [
			{
				byteOffset: 0,
				charOffset: 0,
			},
			{
				byteOffset: 3,
				charOffset: 2,
			},
			{
				byteOffset: 16,
				charOffset: 9,
			},
		]);
	});


	test('iterLineStartPositions in unix.txt', () => {
		testIterLineStartPositions('unix.txt', [
			{
				byteOffset: 0,
				charOffset: 0,
			},
			{
				byteOffset: 2,
				charOffset: 2,
			},
			{
				byteOffset: 14,
				charOffset: 9,
			},
		]);
	});

	function testIterCharPositions(filename: string, expectedChars: any[]) {
		const doc = docs.get(filename)!;

		let i = 0;
		for (const info of ext.iterCharPositions(doc)) {
			const expectedChar = expectedChars[i];
			const actualChar = {
				line: info.pos.line,
				column: info.pos.character,
				byteOffset: info.byteOffset,
				charOffset: info.charOffset,
				codePoint: info.char.codePointAt(0),
				char: info.char,

			};
			assert.deepStrictEqual(actualChar, expectedChar, `error at position ${i}`);
			i++;
		}
	}

	test('iterCharPositions in windows.txt', () => {
		testIterCharPositions('windows.txt', [
			{
				line: 0,
				column: 0,
				char: "a",
				byteOffset: 0,
				charOffset: 0,
				codePoint: 0x61,
			},
			{
				line: 0,
				column: 1,
				char: "\r\n",
				byteOffset: 1,
				charOffset: 1,
				codePoint: 0x0d,
			},
			{
				line: 1,
				column: 0,
				char: "b",
				byteOffset: 3,
				charOffset: 2,
				codePoint: 0x62,
			},
			{
				line: 1,
				column: 1,
				char: "\u001b",
				byteOffset: 4,
				charOffset: 3,
				codePoint: 0x1b,
			},
			{
				line: 1,
				column: 2,
				char: "æ",
				byteOffset: 5,
				charOffset: 4,
				codePoint: 0xe6,
			},
			{
				line: 1,
				column: 3,
				char: "Ω",
				byteOffset: 7,
				charOffset: 5,
				codePoint: 0x03a9,
			},
			{
				line: 1,
				column: 4,
				char: "😀",
				byteOffset: 9,
				charOffset: 6,
				codePoint: 0x1f600,
			},
			{
				line: 1,
				column: 6,
				char: "x",
				byteOffset: 13,
				charOffset: 7,
				codePoint: 0x78,
			},
			{
				line: 1,
				column: 7,
				char: "\r\n",
				byteOffset: 14,
				charOffset: 8,
				codePoint: 0x0d,
			},
			{
				line: 2,
				column: 0,
				char: "c",
				byteOffset: 16,
				charOffset: 9,
				codePoint: 0x63,
			},
			{
				line: 2,
				column: 1,
				char: "",
				byteOffset: 17,
				charOffset: 10,
				codePoint: undefined,
			},
		]);
	});

	test('iterCharPositions in unix.txt', () => {
		testIterCharPositions('unix.txt', [
			{
				line: 0,
				column: 0,
				char: "a",
				byteOffset: 0,
				charOffset: 0,
				codePoint: 0x61,
			},
			{
				line: 0,
				column: 1,
				char: "\n",
				byteOffset: 1,
				charOffset: 1,
				codePoint: 0x0a,
			},
			{
				line: 1,
				column: 0,
				char: "b",
				byteOffset: 2,
				charOffset: 2,
				codePoint: 0x62,
			},
			{
				line: 1,
				column: 1,
				char: "\u001b",
				byteOffset: 3,
				charOffset: 3,
				codePoint: 0x1b,
			},
			{
				line: 1,
				column: 2,
				char: "æ",
				byteOffset: 4,
				charOffset: 4,
				codePoint: 0xe6,
			},
			{
				line: 1,
				column: 3,
				char: "Ω",
				byteOffset: 6,
				charOffset: 5,
				codePoint: 0x03a9,
			},
			{
				line: 1,
				column: 4,
				char: "😀",
				byteOffset: 8,
				charOffset: 6,
				codePoint: 0x1f600,
			},
			{
				line: 1,
				column: 6,
				char: "x",
				byteOffset: 12,
				charOffset: 7,
				codePoint: 0x78,
			},
			{
				line: 1,
				column: 7,
				char: "\n",
				byteOffset: 13,
				charOffset: 8,
				codePoint: 0x0a,
			},
			{
				line: 2,
				column: 0,
				char: "c",
				byteOffset: 14,
				charOffset: 9,
				codePoint: 0x63,
			},
			{
				line: 2,
				column: 1,
				char: "",
				byteOffset: 15,
				charOffset: 10,
				codePoint: undefined,
			},
		]);
	});

	test('parseOffset', () => {
		assert.deepStrictEqual(ext.parseOffset('10'), { isRelative: false, value: 10 });
		assert.deepStrictEqual(ext.parseOffset('0x0a'), { isRelative: false, value: 10 });
		assert.deepStrictEqual(ext.parseOffset('+10'), { isRelative: true, value: 10 });
		assert.deepStrictEqual(ext.parseOffset('+0x0a'), { isRelative: true, value: 10 });
		assert.deepStrictEqual(ext.parseOffset('-10'), { isRelative: true, value: -10 });
		assert.deepStrictEqual(ext.parseOffset('-0x0a'), { isRelative: true, value: -10 });
	});

	test('parseCodePoint', () => {
		assert.strictEqual(ext.parseCodePoint('10'), 10);
		assert.strictEqual(ext.parseCodePoint('0x0a'), 10);
		assert.strictEqual(ext.parseCodePoint('\\u0a'), 10);
		assert.strictEqual(ext.parseCodePoint('\\x0a'), 10);
		assert.strictEqual(ext.parseCodePoint('U+0a'), 10);
	});
});
