# ===== Variables =====

VERSION_FILE = "VERSION"
PEGJS_VERSION = $(shell cat $(VERSION_FILE))

# ===== Modules =====

# Order matters -- dependencies must be listed before modules dependent on them.
MODULES = utils/arrays                          \
          utils/objects                         \
          utils/classes                         \
          grammar-error                         \
          parser                                \
          compiler/asts                         \
          compiler/visitor                      \
          compiler/opcodes                      \
          compiler/javascript                   \
          compiler/passes/generate-bytecode     \
          compiler/passes/generate-javascript   \
          compiler/passes/remove-proxy-rules    \
          compiler/passes/report-left-recursion \
          compiler/passes/report-missing-rules  \
          compiler                              \
          peg

MODULES_SRC = $(foreach module, $(MODULES), lib/$(module).js)

# ===== Directories =====

SRC_DIR              = src
LIB_DIR              = lib
BIN_DIR              = bin
BROWSER_DIR          = browser
SPEC_DIR             = spec
BENCHMARK_DIR        = benchmark
NODE_MODULES_DIR     = node_modules
NODE_MODULES_BIN_DIR = $(NODE_MODULES_DIR)/.bin

# ===== Files =====

PARSER_SRC_FILE = $(SRC_DIR)/parser.pegjs
PARSER_OUT_FILE = $(LIB_DIR)/parser.js

BROWSER_FILE_DEV = $(BROWSER_DIR)/peg-$(PEGJS_VERSION).js
BROWSER_FILE_MIN = $(BROWSER_DIR)/peg-$(PEGJS_VERSION).min.js

# ===== Executables =====

JSHINT        = jshint
UGLIFYJS      = uglifyjs
JASMINE_NODE  = jasmine-node
BENCHMARK_RUN = $(BENCHMARK_DIR)/run

# We can only run bin/pegjs in the source tree to build the parser if
# the parser in lib/parser.js has alraedy been built. The parser is
# checked in, but may have been removed or damaged during development
# If it doesn't exist, we'll use the installed pegjs as a bootstrap parser.
PEGJS         = $(if $(wildcard $(PARSER_OUT_FILE)),$(BIN_DIR)/pegjs,pegjs)

# ===== Execution setup =====
RUN           = env "PATH=$(NODE_MODULES_BIN_DIR):$(PATH)"

# ===== Targets =====

# ----- Convenience targets -----

# Default target: build everything
all: parser browser

# Generate the grammar parser
parser:
	$(RUN) $(PEGJS) $(PARSER_SRC_FILE) $(PARSER_OUT_FILE)

# Build the browser version of the library
browser: $(BROWSER_FILE_MIN)

# Run the spec suite
spec:
	$(RUN) $(JASMINE_NODE) --verbose $(SPEC_DIR)

# Run the benchmark suite
benchmark:
	$(RUN) $(BENCHMARK_RUN)

# Run JSHint on the source
hint:
	$(RUN) $(JSHINT)                                                         \
	  `find $(LIB_DIR) -name '*.js'`                                         \
	  `find $(SPEC_DIR) -name '*.js' -and -not -path '$(SPEC_DIR)/vendor/*'` \
	  $(BENCHMARK_DIR)/*.js                                                  \
	  $(BENCHMARK_RUN)                                                       \
	  $(PEGJS)

# Remove all generated files
clean: browserclean parserclean

# Remove the generated parser
parserclean:
	rm -f $(PARSER_OUT_FILE)

# Remove browser version of the library (created by "browser")
browserclean:
	rm -rf $(BROWSER_DIR)

FAKE = all parser browser spec benchmark hint clean parserclean browserclean
.PHONY:  $(FAKE)
#.SILENT: $(FAKE)

# ----- File targets -----

$(BROWSER_FILE_MIN): $(BROWSER_FILE_DEV)
	$(RUN) $(UGLIFYJS)          \
	  --mangle                  \
	  --compress warnings=false \
	  --comments /Copyright/    \
	  -o $(BROWSER_FILE_MIN)    \
	  $(BROWSER_FILE_DEV)

$(BROWSER_FILE_DEV): $(PARSER_OUT_FILE) $(MODULES_SRC)
	mkdir -p $(BROWSER_DIR)

	rm -f $(BROWSER_FILE_DEV)
	rm -f $(BROWSER_FILE_MIN)

	# The following code is inspired by CoffeeScript's Cakefile.

	echo '/*'                                                                          >> $(BROWSER_FILE_DEV)
	echo " * PEG.js $(PEGJS_VERSION)"                                                  >> $(BROWSER_FILE_DEV)
	echo ' *'                                                                          >> $(BROWSER_FILE_DEV)
	echo ' * http://pegjs.majda.cz/'                                                   >> $(BROWSER_FILE_DEV)
	echo ' *'                                                                          >> $(BROWSER_FILE_DEV)
	echo ' * Copyright (c) 2010-2013 David Majda'                                      >> $(BROWSER_FILE_DEV)
	echo ' * Licensed under the MIT license.'                                          >> $(BROWSER_FILE_DEV)
	echo ' */'                                                                         >> $(BROWSER_FILE_DEV)
	echo 'var PEG = (function(undefined) {'                                            >> $(BROWSER_FILE_DEV)
	echo '  var modules = {'                                                           >> $(BROWSER_FILE_DEV)
	echo '    define: function(name, factory) {'                                       >> $(BROWSER_FILE_DEV)
	echo '      var dir    = name.replace(/(^|\/)[^/]+$$/, "$$1"),'                    >> $(BROWSER_FILE_DEV)
	echo '          module = { exports: {} };'                                         >> $(BROWSER_FILE_DEV)
	echo ''                                                                            >> $(BROWSER_FILE_DEV)
	echo '      function require(path) {'                                              >> $(BROWSER_FILE_DEV)
	echo '        var name   = dir + path,'                                            >> $(BROWSER_FILE_DEV)
	echo '            regexp = /[^\/]+\/\.\.\/|\.\//;'                                 >> $(BROWSER_FILE_DEV)
	echo ''                                                                            >> $(BROWSER_FILE_DEV)
	echo "        /* Can't use /.../g because we can move backwards in the string. */" >> $(BROWSER_FILE_DEV)
	echo '        while (regexp.test(name)) {'                                         >> $(BROWSER_FILE_DEV)
	echo '          name = name.replace(regexp, "");'                                  >> $(BROWSER_FILE_DEV)
	echo '        }'                                                                   >> $(BROWSER_FILE_DEV)
	echo ''                                                                            >> $(BROWSER_FILE_DEV)
	echo '        return modules[name];'                                               >> $(BROWSER_FILE_DEV)
	echo '      }'                                                                     >> $(BROWSER_FILE_DEV)
	echo ''                                                                            >> $(BROWSER_FILE_DEV)
	echo '      factory(module, require);'                                             >> $(BROWSER_FILE_DEV)
	echo '      this[name] = module.exports;'                                          >> $(BROWSER_FILE_DEV)
	echo '    }'                                                                       >> $(BROWSER_FILE_DEV)
	echo '  };'                                                                        >> $(BROWSER_FILE_DEV)
	echo ''                                                                            >> $(BROWSER_FILE_DEV)

	for module in $(MODULES); do                                                                \
	  echo "  modules.define(\"$$module\", function(module, require) {" >> $(BROWSER_FILE_DEV); \
	  sed -e 's/^/    /' lib/$$module.js                                >> $(BROWSER_FILE_DEV); \
	  echo '  });'                                                      >> $(BROWSER_FILE_DEV); \
	  echo ''                                                           >> $(BROWSER_FILE_DEV); \
	done

	echo '  return modules["peg"]' >> $(BROWSER_FILE_DEV)
	echo '})();'                   >> $(BROWSER_FILE_DEV)

