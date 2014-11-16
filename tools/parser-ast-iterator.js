function Parser(grammar, startRule) {
	var ast = PEG.parser.parse(grammar);
	var rules = {};
	for (var i = 0; i != ast.rules.length; ++i) {
		rules[ast.rules[i].name] = ast.rules[i];
	}
	
	function compileActions(ast) {
		var jsParts = [];
		jsParts.push('function offset() { return iter.frame.startPos; }')
		jsParts.push("function line() {" + 
						"return iter.text.substr(0," +
							"iter.frame.startPos).split('\\n').length;" +
					 "}");
		jsParts.push("function column() {" +
						"var lines = iter.text.substr(0," +
							"iter.frame.startPos).split('\\n');" +
						"return lines[lines.length - 1].length + 1;" +
					"}");
		jsParts.push("function text() {" +
						"return iter.text.substr(iter.frame.startPos, iter.frame.pos);" +
					"}");
		jsParts.push("function expected(msg) {" +
						"throw new Error(msg);" +
					"}");
		jsParts.push("var error = expected;");
		jsParts.push("var options = iter.options;");
		jsParts.push("iter.exports = {};")

		function makeFunc(prefix, id, paramNames, body) {
			var name = prefix + '$' + id;
			jsParts.push('iter.exports.' + name +
				' = function ' + name + '(' + paramNames.join(', ') + ') {');
			jsParts.push(body);
			jsParts.push('}');
			console.log('making', name, paramNames, body);
			return function(iter, seqFrame) {
				console.log('trampoline', name, iter.exports[name], seqFrame.$results);
				return iter.exports[name].apply(iter, seqFrame.$results);
			};
		}
		function compileNode(node, prefix, id, labels) {
			if (node.initializer) {
				jsParts.push(ast.initializer.code);
			}
			if (node.rules) {
				for (var i = 0; i != node.rules.length; ++i) {
					compileNode(node.rules[i], node.rules[i].name, 0);
				}
			} else if(node.expression) {
				id = compileNode(node.expression, prefix, id)
			}
			if (node.alternatives) {
				for(var i = 0; i != node.alternatives.length; ++i) {
					id = compileNode(node.alternatives[i], prefix, id);
				}
			}
			if (node.elements) {
				var seqLabels = [];
				for(var i = 0; i != node.elements.length; ++i) {
					if (node.elements[i].label) {
						seqLabels.push(node.elements[i].label);
					}
					id = compileNode(node.elements[i], prefix, id, seqLabels);
				}
			}
			if (node.code) {
				switch(node.type) {
				case 'action':
					if (node.expression && node.expression.elements) {
						var seqLabels = node.expression.elements.map(function(e) {
							return e.label;
						}).filter(function(l) {
							return l != undefined;
						});
					} else {
						seqLabels = [];
					}
					console.log(node.func);
					node.func = makeFunc(prefix, id++, seqLabels, node.code);
					console.log(node.func);
					break;

				case 'semantic_and':
				case 'semantic_not':
					node.func = makeFunc(prefix, id++, labels, node.code);
					break;
				}
			}
			return id;
		}
		compileNode(ast, 'base', 0);
		var jsStr = '(function(iter) {' + jsParts.join('\n') + '})';
		ast.initFunc = eval(jsStr);
	}

	compileActions(ast);

	function ParseIterator(text) {
		this.text = text;
		this.frame = {
			ptr: ast,
			startRule: startRule? rules[startRule] : ast.rules[0],
			pos: 0,
			state: this.START
		};
		this.stack = [];
	};

	function flatStr(ary) {
		if (!Array.isArray(ary)) {
			if (ary == undefined) {
				return '';
			} else {
				return '' + ary;
			}
		}
		return ary.map(function(e) { return flatStr(e); }).join('');
	}

	ParseIterator.prototype = {
		START: { '_': 'START',
			grammar: function START_grammar() {
				this.frame.state = this.EXIT;
				this.frame.ptr.initFunc.apply(this, [this]);
				return this.enter(this.frame.startRule);
			}
		},

		ENTER: { _: 'ENTER',
			expression: function ENTER_expression() {
				this.frame.state = this.EVAL;
				return this.enter(this.frame.ptr.expression);
			},

			rule_ref: function ENTER_rule_ref() {
				this.frame.state = this.EVAL;
				return this.enter(rules[this.frame.ptr.name]);
			},

			sequence: function ENTER_sequence() {
				this.frame.state = this.EVAL;
				this.frame.element = 0;
				return this.enter(this.frame.ptr.elements[this.frame.element]);
			},

			choice: function ENTER_choice() {
				this.frame.state = this.EVAL;
				this.frame.alternative = 0;
				return this.enter(this.frame.ptr.alternatives[this.frame.alternative]);
			},

			literal: function ENTER_literal() {
				var str = this.frame.ptr.value;
				var substr = this.text.substr(this.frame.pos, str.length);
				if (str == substr) {
					this.frame.pos += substr.length;
					return this.exit(true, str);
				}
				return this.exit(false);
			},

			'class': function ENTER_class() {
				var ch = this.text.charAt(this.frame.pos);
				var parts = this.frame.ptr.parts;
				for (var i = 0; i != parts.length; ++i) {
					if (Array.isArray(parts[i])) {
						if (parts[i][0] <= ch &&
							parts[i][1] >= ch) {
							this.frame.pos++;
							return this.exit(true, ch);
						}
					} else if (parts[i] == ch) {
						this.frame.pos++;
						return this.exit(true, ch);
					}
				}
				return this.exit(false);
			},

			one_or_more: function ENTER_one_or_more() {
				this.frame.state = this.EVAL;
				this.frame.min_matches = 1;
				return this.enter(this.frame.ptr.expression);
			},

			optional: function ENTER_optional() {
				this.frame.state = this.EVAL;
				this.frame.max_matches = 1;
				return this.enter(this.frame.ptr.expression);				
			},

			_semantic: function ENTER_semantic() {
				this.frame.state = this.EVAL;
				var seqFrame = this.stack[this.stack.length - 1];
				var val = this.frame.ptr.func.apply(this, [this, seqFrame]);
				console.log(val);
				if (this.frame.ptr.type == 'semantic_and') {
					return this.exit(val, val);
				} else {
					return this.exit(!val, val);
				}
			}
		},

		EVAL: { _: 'EVAL',
			action: function EVAL_action() {
				if (this.frame._.success) {
					this.frame.pos = this.frame._.pos;
					return this.exit(true,
						this.frame.ptr.func.apply(this, [this, this.frame._]));
				}
				return this.exit(false);
			},

			expression: function EVAL_expression() {
				this.frame.result = this.frame._.result;
				if (this.frame._.success) {
					this.frame.pos = this.frame._.pos;
				}
				return this.exit(this.frame._.success, this.frame._.result);
			},

			_loop: function EVAL_loop() {
				if (!this.frame._.success ||
					(this.frame.max_matches != undefined &&
					 this.frame.$_.length == this.frame.max_matches)) {
					if (this.frame.min_matches == undefined ||
						this.frame.$_.length > this.frame.min_matches) {
						if (this.frame._.success) {
							this.frame.pos = this.frame._.pos;
						}
						return this.exit(true,
							this.frame.$_.map(function(frame) {
								return frame.result;
							}).filter(function(result) {
								return result != undefined;
							}));
					}
					return this.exit(false);
				}
				this.frame.pos = this.frame._.pos;
				return this.enter(this.frame.ptr.expression);
			},

			sequence: function EVAL_sequence() {
				if (!this.frame._.success) {
					return this.exit(false);
				}
				if (this.frame._.ptr.label) {
					this.frame.$results = this.frame.$results || [];
					this.frame.$results.push(this.frame._.result);
					this.frame.$labels = this.frame.$labels || [];
					this.frame.$labels.push(this.frame._.ptr.label);
				}
				this.frame.pos = this.frame._.pos;
				if (++this.frame.element < this.frame.ptr.elements.length) {
					return this.enter(this.frame.ptr.elements[this.frame.element]);
				}
				return this.exit(true, this.frame.$_.map(function(f) {
					return f.result;
				}));
			},

			choice: function EVAL_choice() {
				if (this.frame._.success) {
					this.frame.pos = this.frame._.pos;
					return this.exit(true, this.frame._.result);
				} else if(++this.frame.alternative < this.frame.ptr.alternatives.length) {
					return this.enter(this.frame.ptr.alternatives[this.frame.alternative]);
				}
				return this.exit(false);
			},

			text: function EVAL_text() {
				this.frame.result = this.frame._.result;
				if (this.frame._.success) {
					this.frame.pos = this.frame._.pos;
				}
				return this.exit(this.frame._.success,
					flatStr(this.frame._.result));
			}
		},

		EXIT: { _: 'EXIT' },

		enter: function ParseIt_enter(node) {
			this.push();
			this.frame = {
				ptr: node,
				pos: this.frame.pos,
				startPos: this.frame.pos,
				state: this.ENTER
			};
			if (node.label) {
				this.frame.label = node.label;
			}
			if (node.name) {
				this.frame.name = node.name;
			}
			return this.frame;		
		},

		exit: function ParseIt_exit(success, result) {
			this.frame.state = this.EXIT;
			this.frame.result = result;
			this.frame.success = success;
			var ret = this.frame;
			this.frame = this.stack.pop();
			this.frame._ = ret;
			this.frame.$_ = this.frame.$_ || [];
			this.frame.$_.push(ret);
			return ret;
		},

		push: function ParseIt_push() {
			return this.stack.push(this.frame);
		},

		next: function ParseIt_next() {
			return {
				value: this.frame.state[this.frame.ptr.type].apply(this),
				done: this.frame.ptr.type == 'grammar' && this.frame.state._ == 'EXIT'
			}
		},
	};

	ParseIterator.prototype.ENTER.rule =
	ParseIterator.prototype.ENTER.named =
	ParseIterator.prototype.ENTER.action =
	ParseIterator.prototype.ENTER.labeled =
	ParseIterator.prototype.ENTER.zero_or_more =
	ParseIterator.prototype.ENTER.text =
		ParseIterator.prototype.ENTER.expression;

	ParseIterator.prototype.ENTER.semantic_and =
	ParseIterator.prototype.ENTER.semantic_not =
		ParseIterator.prototype.ENTER._semantic;

	ParseIterator.prototype.EVAL.rule =
	ParseIterator.prototype.EVAL.rule_ref =
	ParseIterator.prototype.EVAL.named =
	ParseIterator.prototype.EVAL.labeled =
		ParseIterator.prototype.EVAL.expression;

	ParseIterator.prototype.EVAL.zero_or_more =
	ParseIterator.prototype.EVAL.one_or_more =
	ParseIterator.prototype.EVAL.optional =
		ParseIterator.prototype.EVAL._loop;



	return function(text) {
		return new ParseIterator(text);
	};
}
