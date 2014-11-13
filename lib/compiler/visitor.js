var objects = require("../utils/objects"),
    arrays  = require("../utils/arrays");

/* Simple AST node visitor builder. */
var visitor = {
  build: function(functions) {
    var state = {
      backtrace: []      
    };

    function visit(node) {
      state.backtrace.push(node);
      result = functions[node.type].apply(state, arguments);
      state.backtrace.pop();
      return result;
    }

    function visitNop() { }

    function visitExpression(node) {
      var extraArgs = Array.prototype.slice.call(arguments, 1);

      return visit.apply(state, [node.expression].concat(extraArgs));
    }

    function visitChildren(property) {
      return function(node) {
        var extraArgs = Array.prototype.slice.call(arguments, 1);

        arrays.each(node[property], function(child) {
          visit.apply(state, [child].concat(extraArgs));
        });
      };
    }

    var DEFAULT_FUNCTIONS = {
          grammar: function(node) {
            var extraArgs = Array.prototype.slice.call(arguments, 1);

            if (node.initializer) {
              visit.apply(state, [node.initializer].concat(extraArgs));
            }

            arrays.each(node.rules, function(rule) {
              visit.apply(state, [rule].concat(extraArgs));
            });
          },

          initializer:  visitNop,
          rule:         visitExpression,
          named:        visitExpression,
          choice:       visitChildren("alternatives"),
          action:       visitExpression,
          sequence:     visitChildren("elements"),
          labeled:      visitExpression,
          text:         visitExpression,
          simple_and:   visitExpression,
          simple_not:   visitExpression,
          optional:     visitExpression,
          zero_or_more: visitExpression,
          one_or_more:  visitExpression,
          semantic_and: visitNop,
          semantic_not: visitNop,
          rule_ref:     visitNop,
          literal:      visitNop,
          "class":      visitNop,
          any:          visitNop
        };

    objects.defaults(functions, DEFAULT_FUNCTIONS);

    return visit.bind(visit);
  }
};

module.exports = visitor;
