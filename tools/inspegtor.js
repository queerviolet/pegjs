var grammarCm = null;
var textCm = null;
var iterator = null;
var state = 'stepping';

function main() {
	console.log(window.parser, window.text);
	parserCm = CodeMirror.fromTextArea(window.parser, {
		mode: 'pegjs',
		theme: 'midnight'});
	parserCm.setSize(null, '100%');
	textCm = CodeMirror.fromTextArea(window.text, {
		theme: 'midnight'
	});
	textCm.setSize(null, '100%');
	reset();
}

window.addEventListener('load', main);

function step(count) {
	count = count || 1;
	frames = [];
	for (var it = iterator.next(), i = 0; it.done == false && i < count;
		it = iterator.next(), ++i) {
		frames.push(it.value);
		if (it.done) {
			state = 'done';
			break;
		}
	}
	for (var i = 0; i < frames.length; ++i) {
		var frame = frames[i];
		backtrace.appendChild(fmtFrame(frame));
		highlight(frame, frame.startPos, frame.pos);
		traceContainer.scrollTop = traceContainer.scrollHeight;
	}
}

function reset() {
	highlight();
	backtrace.innerHTML = '';
	iterator = Parser(parserCm.getValue())(textCm.getValue());
	state = 'stepping';
}

function frame() {
	if (state == 'running') {
		step(10);
		requestAnimationFrame(frame);
	}
}

function keyDown(e) {
	if (e.target == document.body) {
		if (e.which == 13 /* ENTER */) {
			if (e.ctrlKey) {
				reset();
				state = 'running';
				frame();
			} else if (state != 'done') {
				if (state == 'stepping') {
					state = 'running';
					frame();
				} else if (state == 'running') {
					state = 'stepping';
				}
			}
		} else if (e.which == 32 /* Space */) {
			if (e.ctrlKey) {
				reset();
				state = 'stepping';
				step();
			} else if (state != 'done') {
				if (state == 'running') {
					state = 'stepping';							
				} else {
					step();
				}
			}
		}
	}
}
window.addEventListener('keydown', keyDown);

function posToLineCol(str, pos) {
	lines = str.substr(0, pos).split('\n');
	console.log(lines);
	return [lines.length, lines[lines.length - 1].length];
}

function oldHighlight(frame, txtStart, txtEnd) {
	grammar = parser.textContent;
	if (frame && frame.ptr.pos) {
		parser.innerHTML = grammar.substring(0, frame.ptr.pos.start) + 
			'<b>' + grammar.substring(frame.ptr.pos.start, frame.ptr.pos.end) + '</b>' +
			grammar.substring(frame.ptr.pos.end, grammar.length);
	} else {
		parser.textContent = grammar;
	}
	txt = text.textContent;
	if (txtStart != undefined) {
		text.innerHTML = '<i>' + txt.substring(0, txtStart) + '</i>' + 
			'<b>' + txt.substring(txtStart, txtEnd) + '</b>' +
			txt.substring(txtEnd, txt.length);
	} else {
		text.textContent = txt;
	}
}

var marks = [];
function highlight(frame, txtStart, txtEnd) {
	for (var i = 0; i != marks.length; ++i) {
		marks[i].clear();
	}
	marks = [];

	if (frame && frame.ptr.pos) {
		marks.push(parserCm.markText(
			parserCm.posFromIndex(frame.ptr.pos.start),
			parserCm.posFromIndex(frame.ptr.pos.end), {
				className: 'active'
			}));
	}
	if (txtStart != undefined) {
		marks.push(textCm.markText(
			textCm.posFromIndex(0),
			textCm.posFromIndex(txtStart), {
				className: 'matched'
			}));
		marks.push(textCm.markText(
			textCm.posFromIndex(txtStart),
			textCm.posFromIndex(txtEnd), {
				className: 'active'
			}));		
	}
}


function fmtFrame(frame) {
	var tr = document.createElement('tr');
	tr.setAttribute('class', 'state_' + frame.state._ + ' success_' + frame.success);
	var type = document.createElement('td');
	type.textContent = frame.ptr.type;
	tr.appendChild(type);
	var start = document.createElement('td');
	start.textContent = frame.startPos;
	tr.appendChild(start);
	var end = document.createElement('td');
	end.textContent = frame.pos;
	tr.appendChild(end);
	var results = document.createElement('td');
	if (frame.state._ == 'EXIT') {
		results.innerHTML += JSON.stringify(frame.result);
	}
	tr.appendChild(results);
	tr.addEventListener('mousemove', highlight.bind(null,
		frame, frame.startPos, frame.pos));
	return tr;
}