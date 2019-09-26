(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
(function (global){
/*! https://mths.be/punycode v1.4.1 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports &&
		!exports.nodeType && exports;
	var freeModule = typeof module == 'object' && module &&
		!module.nodeType && module;
	var freeGlobal = typeof global == 'object' && global;
	if (
		freeGlobal.global === freeGlobal ||
		freeGlobal.window === freeGlobal ||
		freeGlobal.self === freeGlobal
	) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^\x20-\x7E]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw new RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		var result = [];
		while (length--) {
			result[length] = fn(array[length]);
		}
		return result;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings or email
	 * addresses.
	 * @private
	 * @param {String} domain The domain name or email address.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		var parts = string.split('@');
		var result = '';
		if (parts.length > 1) {
			// In email addresses, only the domain name should be punycoded. Leave
			// the local part (i.e. everything up to `@`) intact.
			result = parts[0] + '@';
			string = parts[1];
		}
		// Avoid `split(regex)` for IE8 compatibility. See #17.
		string = string.replace(regexSeparators, '\x2E');
		var labels = string.split('.');
		var encoded = map(labels, fn).join('.');
		return result + encoded;
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <https://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * https://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols (e.g. a domain name label) to a
	 * Punycode string of ASCII-only symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name or an email address
	 * to Unicode. Only the Punycoded parts of the input will be converted, i.e.
	 * it doesn't matter if you call it on a string that has already been
	 * converted to Unicode.
	 * @memberOf punycode
	 * @param {String} input The Punycoded domain name or email address to
	 * convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(input) {
		return mapDomain(input, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name or an email address to
	 * Punycode. Only the non-ASCII parts of the domain name will be converted,
	 * i.e. it doesn't matter if you call it with a domain that's already in
	 * ASCII.
	 * @memberOf punycode
	 * @param {String} input The domain name or email address to convert, as a
	 * Unicode string.
	 * @returns {String} The Punycode representation of the given domain name or
	 * email address.
	 */
	function toASCII(input) {
		return mapDomain(input, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.4.1',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <https://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define('punycode', function() {
			return punycode;
		});
	} else if (freeExports && freeModule) {
		if (module.exports == freeExports) {
			// in Node.js, io.js, or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else {
			// in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else {
		// in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],2:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],3:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return map(obj[k], function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],4:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":2,"./encode":3}],5:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var punycode = require('punycode');
var util = require('./util');

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

exports.Url = Url;

function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]*$/,

    // Special case for a simple path URL
    simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''].concat(unwise),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape),
    hostEndingChars = ['/', '?', '#'],
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/,
    hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    querystring = require('querystring');

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && util.isObject(url) && url instanceof Url) return url;

  var u = new Url;
  u.parse(url, parseQueryString, slashesDenoteHost);
  return u;
}

Url.prototype.parse = function(url, parseQueryString, slashesDenoteHost) {
  if (!util.isString(url)) {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  // Copy chrome, IE, opera backslash-handling behavior.
  // Back slashes before the query string get converted to forward slashes
  // See: https://code.google.com/p/chromium/issues/detail?id=25916
  var queryIndex = url.indexOf('?'),
      splitter =
          (queryIndex !== -1 && queryIndex < url.indexOf('#')) ? '?' : '#',
      uSplit = url.split(splitter),
      slashRegex = /\\/g;
  uSplit[0] = uSplit[0].replace(slashRegex, '/');
  url = uSplit.join(splitter);

  var rest = url;

  // trim before proceeding.
  // This is to support parse stuff like "  http://foo.com  \n"
  rest = rest.trim();

  if (!slashesDenoteHost && url.split('#').length === 1) {
    // Try fast path regexp
    var simplePath = simplePathPattern.exec(rest);
    if (simplePath) {
      this.path = rest;
      this.href = rest;
      this.pathname = simplePath[1];
      if (simplePath[2]) {
        this.search = simplePath[2];
        if (parseQueryString) {
          this.query = querystring.parse(this.search.substr(1));
        } else {
          this.query = this.search.substr(1);
        }
      } else if (parseQueryString) {
        this.search = '';
        this.query = {};
      }
      return this;
    }
  }

  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    this.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      this.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {

    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:c path:/?@c

    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.

    // find the first instance of any hostEndingChars
    var hostEnd = -1;
    for (var i = 0; i < hostEndingChars.length; i++) {
      var hec = rest.indexOf(hostEndingChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }

    // at this point, either we have an explicit point where the
    // auth portion cannot go past, or the last @ char is the decider.
    var auth, atSign;
    if (hostEnd === -1) {
      // atSign can be anywhere.
      atSign = rest.lastIndexOf('@');
    } else {
      // atSign must be in auth portion.
      // http://a@b/c@d => host:b auth:a path:/c@d
      atSign = rest.lastIndexOf('@', hostEnd);
    }

    // Now we have a portion which is definitely the auth.
    // Pull that off.
    if (atSign !== -1) {
      auth = rest.slice(0, atSign);
      rest = rest.slice(atSign + 1);
      this.auth = decodeURIComponent(auth);
    }

    // the host is the remaining to the left of the first non-host char
    hostEnd = -1;
    for (var i = 0; i < nonHostChars.length; i++) {
      var hec = rest.indexOf(nonHostChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }
    // if we still have not hit it, then the entire thing is a host.
    if (hostEnd === -1)
      hostEnd = rest.length;

    this.host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);

    // pull out port.
    this.parseHost();

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    this.hostname = this.hostname || '';

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = this.hostname[0] === '[' &&
        this.hostname[this.hostname.length - 1] === ']';

    // validate a little.
    if (!ipv6Hostname) {
      var hostparts = this.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) continue;
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            this.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = '';
    } else {
      // hostnames are always lower case.
      this.hostname = this.hostname.toLowerCase();
    }

    if (!ipv6Hostname) {
      // IDNA Support: Returns a punycoded representation of "domain".
      // It only converts parts of the domain name that
      // have non-ASCII characters, i.e. it doesn't matter if
      // you call it with a domain that already is ASCII-only.
      this.hostname = punycode.toASCII(this.hostname);
    }

    var p = this.port ? ':' + this.port : '';
    var h = this.hostname || '';
    this.host = h + p;
    this.href += this.host;

    // strip [ and ] from the hostname
    // the host field still retains them, though
    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {

    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      if (rest.indexOf(ae) === -1)
        continue;
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }
  }


  // chop off from the tail first.
  var hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    this.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = rest.indexOf('?');
  if (qm !== -1) {
    this.search = rest.substr(qm);
    this.query = rest.substr(qm + 1);
    if (parseQueryString) {
      this.query = querystring.parse(this.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    this.search = '';
    this.query = {};
  }
  if (rest) this.pathname = rest;
  if (slashedProtocol[lowerProto] &&
      this.hostname && !this.pathname) {
    this.pathname = '/';
  }

  //to support http.request
  if (this.pathname || this.search) {
    var p = this.pathname || '';
    var s = this.search || '';
    this.path = p + s;
  }

  // finally, reconstruct the href based on what has been validated.
  this.href = this.format();
  return this;
};

// format a parsed object into a url string
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (util.isString(obj)) obj = urlParse(obj);
  if (!(obj instanceof Url)) return Url.prototype.format.call(obj);
  return obj.format();
}

Url.prototype.format = function() {
  var auth = this.auth || '';
  if (auth) {
    auth = encodeURIComponent(auth);
    auth = auth.replace(/%3A/i, ':');
    auth += '@';
  }

  var protocol = this.protocol || '',
      pathname = this.pathname || '',
      hash = this.hash || '',
      host = false,
      query = '';

  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host = auth + (this.hostname.indexOf(':') === -1 ?
        this.hostname :
        '[' + this.hostname + ']');
    if (this.port) {
      host += ':' + this.port;
    }
  }

  if (this.query &&
      util.isObject(this.query) &&
      Object.keys(this.query).length) {
    query = querystring.stringify(this.query);
  }

  var search = this.search || (query && ('?' + query)) || '';

  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (this.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
  if (search && search.charAt(0) !== '?') search = '?' + search;

  pathname = pathname.replace(/[?#]/g, function(match) {
    return encodeURIComponent(match);
  });
  search = search.replace('#', '%23');

  return protocol + host + pathname + search + hash;
};

function urlResolve(source, relative) {
  return urlParse(source, false, true).resolve(relative);
}

Url.prototype.resolve = function(relative) {
  return this.resolveObject(urlParse(relative, false, true)).format();
};

function urlResolveObject(source, relative) {
  if (!source) return relative;
  return urlParse(source, false, true).resolveObject(relative);
}

Url.prototype.resolveObject = function(relative) {
  if (util.isString(relative)) {
    var rel = new Url();
    rel.parse(relative, false, true);
    relative = rel;
  }

  var result = new Url();
  var tkeys = Object.keys(this);
  for (var tk = 0; tk < tkeys.length; tk++) {
    var tkey = tkeys[tk];
    result[tkey] = this[tkey];
  }

  // hash is always overridden, no matter what.
  // even href="" will remove it.
  result.hash = relative.hash;

  // if the relative url is empty, then there's nothing left to do here.
  if (relative.href === '') {
    result.href = result.format();
    return result;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
    var rkeys = Object.keys(relative);
    for (var rk = 0; rk < rkeys.length; rk++) {
      var rkey = rkeys[rk];
      if (rkey !== 'protocol')
        result[rkey] = relative[rkey];
    }

    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[result.protocol] &&
        result.hostname && !result.pathname) {
      result.path = result.pathname = '/';
    }

    result.href = result.format();
    return result;
  }

  if (relative.protocol && relative.protocol !== result.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      var keys = Object.keys(relative);
      for (var v = 0; v < keys.length; v++) {
        var k = keys[v];
        result[k] = relative[k];
      }
      result.href = result.format();
      return result;
    }

    result.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }
    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port;
    // to support http.request
    if (result.pathname || result.search) {
      var p = result.pathname || '';
      var s = result.search || '';
      result.path = p + s;
    }
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  }

  var isSourceAbs = (result.pathname && result.pathname.charAt(0) === '/'),
      isRelAbs = (
          relative.host ||
          relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
                    (result.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = result.pathname && result.pathname.split('/') || [],
      relPath = relative.pathname && relative.pathname.split('/') || [],
      psychotic = result.protocol && !slashedProtocol[result.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {
    result.hostname = '';
    result.port = null;
    if (result.host) {
      if (srcPath[0] === '') srcPath[0] = result.host;
      else srcPath.unshift(result.host);
    }
    result.host = '';
    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
        else relPath.unshift(relative.host);
      }
      relative.host = null;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    result.host = (relative.host || relative.host === '') ?
                  relative.host : result.host;
    result.hostname = (relative.hostname || relative.hostname === '') ?
                      relative.hostname : result.hostname;
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (!util.isNullOrUndefined(relative.search)) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      result.hostname = result.host = srcPath.shift();
      //occationaly the auth can get stuck only in host
      //this especially happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = result.host && result.host.indexOf('@') > 0 ?
                       result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }
    result.search = relative.search;
    result.query = relative.query;
    //to support http.request
    if (!util.isNull(result.pathname) || !util.isNull(result.search)) {
      result.path = (result.pathname ? result.pathname : '') +
                    (result.search ? result.search : '');
    }
    result.href = result.format();
    return result;
  }

  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    result.pathname = null;
    //to support http.request
    if (result.search) {
      result.path = '/' + result.search;
    } else {
      result.path = null;
    }
    result.href = result.format();
    return result;
  }

  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (
      (result.host || relative.host || srcPath.length > 1) &&
      (last === '.' || last === '..') || last === '');

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last === '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    result.hostname = result.host = isAbsolute ? '' :
                                    srcPath.length ? srcPath.shift() : '';
    //occationaly the auth can get stuck only in host
    //this especially happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    var authInHost = result.host && result.host.indexOf('@') > 0 ?
                     result.host.split('@') : false;
    if (authInHost) {
      result.auth = authInHost.shift();
      result.host = result.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || (result.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  if (!srcPath.length) {
    result.pathname = null;
    result.path = null;
  } else {
    result.pathname = srcPath.join('/');
  }

  //to support request.http
  if (!util.isNull(result.pathname) || !util.isNull(result.search)) {
    result.path = (result.pathname ? result.pathname : '') +
                  (result.search ? result.search : '');
  }
  result.auth = relative.auth || result.auth;
  result.slashes = result.slashes || relative.slashes;
  result.href = result.format();
  return result;
};

Url.prototype.parseHost = function() {
  var host = this.host;
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      this.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) this.hostname = host;
};

},{"./util":6,"punycode":1,"querystring":4}],6:[function(require,module,exports){
'use strict';

module.exports = {
  isString: function(arg) {
    return typeof(arg) === 'string';
  },
  isObject: function(arg) {
    return typeof(arg) === 'object' && arg !== null;
  },
  isNull: function(arg) {
    return arg === null;
  },
  isNullOrUndefined: function(arg) {
    return arg == null;
  }
};

},{}],7:[function(require,module,exports){
"use strict";

var H264Player = require('h264-converter').default;
var url = require('url');

function CycleBuffer(capacity) {
    this._capacity = capacity;
    this._front = 0;
    this._back = 0;
    this.length = 0;
    this._buffer = new Uint8Array(capacity);
}

CycleBuffer.prototype.updateLength = function () {
    if (this._front >= this._back)
        this.length = this._front - this._back;
    else
        this.length = this._front + this._capacity - this._back;
}

CycleBuffer.prototype.push = function (uint8Array) {
    var len = uint8Array.byteLength;
    var capacity = this._capacity;
    var buffer = this._buffer;
    var front = this._front;
    var back = this._back;
    if (this.length + len > capacity) {
        debugger;
        throw 'buffer is full.';
    }
    if (front + len < capacity) {
        buffer.set(uint8Array, front);
        this._front = (front + len) % capacity;
    }
    else {
        var len1 = capacity - front;
        var s1 = uint8Array.slice(0, len1);
        var len2 = len - len1;
        var s2 = uint8Array.slice(len1, len1 + len2);
        buffer.set(s1, front);
        buffer.set(s2, 0);
        this._front = len2;
    }
    this.updateLength();
};

CycleBuffer.prototype.pop = function (len) {
    var capacity = this._capacity;
    var buffer = this._buffer;
    var front = this._front;
    var back = this._back;

    if (len > this.length) {
        debugger;
        throw 'the buffer is not enough element for pop.';
    }
    var end = front > back ? front : capacity;
    if (back + len <= end) {
        this._back += len;
        this.updateLength();
        return buffer.slice(back, len + back);
    }
    else {
        var len1 = capacity - back;
        var s1 = buffer.slice(back, len1 + back);
        var len2 = len - len1;
        var s2 = buffer.slice(0, len2);
        var result = new Uint8Array(len);
        result.set(s1, 0);
        result.set(s2, len1);
        this._back = (back + len) % capacity;
        this.updateLength();
        return result;
    }
}


/**
 * Convert a 32-bit quantity (long integer) from host byte order to network byte order (Little-Endian to Big-Endian).
 *
 * @param {Array|Buffer} b Array of octets or a nodejs Buffer
 * @param {number} i Zero-based index at which to write into b
 * @param {number} v Value to convert
 */
function htonl(b, i, v) {
    b[i] = (0xff & (v >> 24));
    b[i + 1] = (0xff & (v >> 16));
    b[i + 2] = (0xff & (v >> 8));
    b[i + 3] = (0xff & (v));
};

/**
 * Convert a 32-bit quantity (long integer) from network byte order to host byte order (Big-Endian to Little-Endian).
 *
 * @param {Array|Buffer} b Array of octets or a nodejs Buffer to read value from
 * @param {number} i Zero-based index at which to read from b
 * @returns {number}
 */
function ntohl(b, i) {
    return ((0xff & b[i]) << 24) |
        ((0xff & b[i + 1]) << 16) |
        ((0xff & b[i + 2]) << 8) |
        ((0xff & b[i + 3]));
};

function toInt16(b, i) {
    return ((0xff & b[i])) | ((0xff & b[i + 1]) << 8);
}

function toInt32(b, i) {
    return ((0xff & b[i])) | ((0xff & b[i + 1]) << 8) | ((0xff & b[i + 2]) << 16) | ((0xff & b[i + 3]) * 16777216);
}

function toInt64(b, i) {
    var i1 = ((0xff & b[i])) | ((0xff & b[i + 1]) << 8) | ((0xff & b[i + 2]) << 16) | ((0xff & b[i + 3]) * 16777216);
    var i2 = ((0xff & b[i + 4])) | ((0xff & b[i + 5]) << 8) | ((0xff & b[i + 6]) << 16) | ((0xff & b[i + 7]) * 16777216);
    return i1 + (i2 * 4294967296);
}

function getUTF8Bytes(string) {
    if (!("TextEncoder" in window))
        throw ("Sorry, this browser does not support TextEncoder...");
    var enc = new TextEncoder();    // always utf-8
    return enc.encode(string);
};

function getUTF8String(uint8Array) {
    if (!("TextDecoder" in window))
        throw ("Sorry, this browser does not support TextDecoder...");
    var enc = new TextDecoder("utf-8");
    return enc.decode(uint8Array);
}

function concatBuffer(uint8Array1, uint8Array2) {
    var result = new Uint8Array(uint8Array1.byteLength + uint8Array2.byteLength);
    result.set(uint8Array1, 0);
    result.set(uint8Array2, uint8Array1.byteLength);
    return result;
}

function buf2hex(uint8Array) {
    var arr = [];
    for (var i = 0; i < uint8Array.byteLength; i++) {
        arr.push(uint8Array[i].toString(16).padStart(2, '0'));
    }
    return arr.join(' ');
    // return Array.prototype.map.call(uint8Array, function (x) {
    //     return ('00' + x.toString(16)).slice(-2);
    // }).join(' ');
}

Date.prototype.format = function (fmt) {
    var o = {
        "M+": this.getMonth() + 1, //月份         
        "d+": this.getDate(), //日         
        "h+": this.getHours(), //小时         
        "H+": this.getHours(), //小时         
        "m+": this.getMinutes(), //分         
        "s+": this.getSeconds(), //秒         
        "q+": Math.floor((this.getMonth() + 3) / 3), //季度         
        "S": this.getMilliseconds() //毫秒         
    };
    var week = {
        "0": "/u65e5",
        "1": "/u4e00",
        "2": "/u4e8c",
        "3": "/u4e09",
        "4": "/u56db",
        "5": "/u4e94",
        "6": "/u516d"
    };
    if (/(y+)/.test(fmt)) {
        fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
    }
    if (/(E+)/.test(fmt)) {
        fmt = fmt.replace(RegExp.$1, ((RegExp.$1.length > 1) ? (RegExp.$1.length > 2 ? "/u661f/u671f" : "/u5468") : "") + week[this.getDay() + ""]);
    }
    for (var k in o) {
        if (new RegExp("(" + k + ")").test(fmt)) {
            fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
        }
    }
    return fmt;
}

/********************************************************************************************************************************************************* */

//import VideoConverter from 'h264-converter';
// var VideoConverter;
// import('/h264-converter/dist/index.js').then((m) => {
//     VideoConverter = m;
// });

var _videoElement = document.getElementById('video');
var _h264Player;

var ws;
var logsElement = document.getElementById('logs');
var recvMsgElemet = document.getElementById('recv');
var logs = '';
var _session = 0;
var _connected = false;
var _auth = false;
var _heartbeatTimer;

var _buffer = new CycleBuffer(8 * 1024 * 1024);

var _continuous = false;
var _lastHeader = {};
var _lastBody;

var _fps = 15;

function openConnection(serverAddress) {
    if (!serverAddress) {
        Log('input ws server address.');
        return;
    }

    if (_connected) {
        Log('ws is connected.');
        return;
    }

    ws = new WebSocket(serverAddress);

    ws.binaryType = "arraybuffer";
    ws.onopen = function () {
        if (_heartbeatTimer) clearInterval(_heartbeatTimer);
        _connected = true;
        _auth = false;
        Log("ws onnected.");
    }

    ws.onmessage = function (e) {
        _buffer.push(new Uint8Array(e.data));
        onReceivedMessage();
    }

    ws.onclose = function () {
        if (_heartbeatTimer) clearInterval(_heartbeatTimer);
        _session = 0;
        _connected = false;
        _auth = false;
        Log("ws connection is closed...");
    }

    ws.onerror = function (e) {
        console.log(e);
        Log(e);
    }
}

function closeConnection() {
    if (ws) {
        ws.close();
    }
}

function sendMsg(msgId, content) {
    if (!ws || !_connected) {
        Log('websocket is not connected.');
        return;
    }

    if (!_auth && (msgId != 0x0000060D)) {
        Log('pu is not auth.');
        return;
    }

    var msgIdValue = parseInt(msgId);
    //var auth = getUTF8Bytes('<?xml version="1.0" encoding="utf-8" ?><Message><Authentication>f8f4ab75564976722aaa05a9dd3f8a12</Authentication><Time>20190419113650</Time><Type>1</Type><Sn>D833517801549</Sn><Ver>2.0</Ver></Message>');
    var body = getUTF8Bytes(content);
    var bodyLen = body.byteLength;

    var headerLen = _session ? 16 : 12;
    var headerBuf = new ArrayBuffer(headerLen);
    var header = new Uint8Array(headerBuf);
    htonl(header, 0, msgIdValue);
    htonl(header, 4, bodyLen);
    if (headerLen >= 16)
        htonl(header, 12, _session);

    var message = concatBuffer(header, body);

    Log(`send message, msgId: ${msgIdValue}, bodyLength: ${bodyLen}, session: ${_session}, content: ${content}`);
    ws.send(message.buffer);
}

function readHeader() {
    if (_buffer.length > 12) {
        var headerLen = 12;
        var msgIdBuf = _buffer.pop(4);
        var msgId = ntohl(msgIdBuf, 0) & 0x0000FFFF;
        //auth message, msgHeader is 12 bytes
        if (msgId == 0x0000060D) {
            headerLen = 12;
        }
        else {
            headerLen = 16;
        }
        var header = new Uint8Array(headerLen);
        header.set(msgIdBuf, 0);
        header.set(_buffer.pop(headerLen - 4), 4);
        var msgLen = ntohl(header, 4);
        var msgErr = ntohl(header, 8);
        if (headerLen >= 16) {
            var session = ntohl(header, 12);
            if (session != _session)
                console.log('sessionId is not matched.');
        }
        _lastHeader['msgId'] = msgId;
        _lastHeader['msgLen'] = msgLen;
        _lastHeader['msgErr'] = msgErr;
        _lastHeader['session'] = _session;
        if (_logMsgHeader)
            Log(`recv message header, msgId: ${msgId}, msgLen: ${msgLen}, msgErr: ${msgErr}, Session: ${_session}`);
        document.getElementById('recvMsg').value = `msgId: ${msgId}, msgLen: ${msgLen}, msgErr: ${msgErr}, Session: ${_session}`;
        //auth message, auth
        if (msgId == 0x0000060D && msgErr == 0) {
            _session = parseInt(Math.random() * 10000);
            _auth = true;
            if (_heartbeatTimer) clearInterval(_heartbeatTimer);
            _heartbeatTimer = setInterval(writeHeartbeat, 10 * 1000);
        }
        return true;
    }

    return false;
}

function readBody(msgLen) {
    if (msgLen <= 0)
        throw 'msgLen must >0.'
    if (_buffer.length >= msgLen) {
        _lastBody = _buffer.pop(msgLen);
        if (_logMsgBody)
            Log(`recv message body, length: ${msgLen}, buffer length: ${_buffer.length}`);
        return true;
    }
    return false;
}

function onReceivedMessage() {
    while (_continuous || _buffer.length >= 12) {
        if (!_continuous) {
            //接收header
            if (readHeader()) {
                //设置是否需要接收BODY
                if (_lastHeader.msgLen > 0)
                    _continuous = true;
                else
                    showMessage('');
            }
            else {
                break;
            }
        }

        if (_continuous) {
            if (readBody(_lastHeader.msgLen)) {
                _continuous = false;
                var bodyString;
                var buf = _lastBody;
                var msgId = _lastHeader.msgId;
                if (msgId == 0x00000102 || msgId == 0x00010102 || msgId == 0x00000202 || msgId == 0x00000302) {
                    onVideoData(buf);
                }
                else {
                    bodyString = getUTF8String(buf);
                    if (msgId == 0x00000101) {   //open video
                        onOpenVideo(bodyString);
                    }
                    showMessage(bodyString);
                    console.log('recv message body: ' + bodyString);
                }
            }
            else {
                break;
            }
        }
    }
}

function showMessage(msgBody) {
    recvMsgElemet.value = msgBody;
}

function onOpenVideo(msgBody) {
    // parse msgbody
    var parser = new DOMParser();
    var xmlDoc = parser.parseFromString(msgBody, 'text/xml');
    var videoEl = xmlDoc.getElementsByTagName('Video');
    if (videoEl && videoEl.length > 0) {
        _fps = parseInt(videoEl[0].getAttribute('Fps'));
    }
    _h264Player = new H264Player(_videoElement, _fps, parseInt(_fps / 2));
    _initedFirstFrame = false;
}

var _firstFrameTime = new Date();
var _lastTimestamp = 0;
var _frameCount = 0;
var _initedFirstFrame = false;
var _lastRecvTime = new Date().getTime();
function onVideoData(buf) {
    if (!_initedFirstFrame) {
        _firstFrameTime = new Date();
        _frameCount = 0;
        _h264Player.play();
        _initedFirstFrame = true;
        _lastRecvTime = new Date().getTime();
    }

    var ts = toInt64(buf, 8);
    var interval = _lastTimestamp > 0 ? ts - _lastTimestamp : 0;
    var thisRecvTime = new Date().getTime();
    var recvInterval = _lastRecvTime > 0 ? thisRecvTime - _lastRecvTime : 0;
    _frameCount++;
    var now = new Date();
    var fps = Math.round(_frameCount * 1000 / (now - _firstFrameTime) * 100) / 100;
    if (recvInterval > 100 || _logVideoFrame) {
        Log(`video frame, frameIndex: ${_frameCount}, chn: ${toInt16(buf, 0)}, streamType: ${toInt16(buf, 2)}, streamIndex: ${toInt16(buf, 4)}, frameType: ${toInt16(buf, 6)}, timestamp: ${ts}, frameSize: ${buf.byteLength - 16}, recvInterval: ${recvInterval}, interval: ${interval}, fps: ${fps}, expectFps: ${_fps}`);
    }
    _lastTimestamp = ts;
    _lastRecvTime = thisRecvTime;

    var frame = buf.slice(16);

    //append frame
    onVideoFrame(frame);

    //show raw hex data
    showMessage(buf2hex(frame));
}

function onVideoFrame(uint8Array) {
    _h264Player.appendRawData(uint8Array);
}

function onVideoClosed() {

}

function writeHeartbeat() {
    sendMsg(0x00000A01, '');
}

function Log(log) {
    logs = '[' + new Date().format('hh:mm:ss.S') + '] ' + log + '\r\n' + logs;
    if (logs.length > 128 * 1024)
        logs = logs.substring(0, 64 * 1024);
    logsElement.value = logs;
}

/********************************************************************************************************** */

function writeMsg() {
    var msgId = document.getElementById('msgId').value;
    var content = document.getElementById('msgBody').value;
    sendMsg(msgId, content);
}

document.getElementById('btnConnect').addEventListener('click', function () {
    var serverAddress = document.getElementById('server').value;
    openConnection(serverAddress);
});
document.getElementById('btnDisconnect').addEventListener('click', function () {
    closeConnection();
});
document.getElementById('btnSendMsg').addEventListener('click', function () {
    writeMsg();
});

document.getElementById('btnAuth').addEventListener('click', function () {
    var current_url = url.parse(document.getElementById('server').value);
    var searchParams = new URLSearchParams(current_url.search);
    var sn = searchParams.get('sn');
    var msgAuth = document.getElementById('msgAuth').value;
    msgAuth = msgAuth.replace('{sn}', sn);

    document.getElementById('msgId').value = '0x0000060D';
    document.getElementById('msgBody').value = msgAuth;
    writeMsg();
});

document.getElementById('btnHeartbeat').addEventListener('click', function () {
    document.getElementById('msgId').value = '0x00000A01';
    document.getElementById('msgBody').value = '';
    writeMsg();
});

document.getElementById('btnOpenVideo').addEventListener('click', function () {
    var msgOpenVideo = document.getElementById('msgOpenVideo').value;
    var current_url = url.parse(document.getElementById('server').value);
    var searchParams = new URLSearchParams(current_url.search);
    var chn = searchParams.get('chn');
    msgOpenVideo = msgOpenVideo.replace('{channel}', chn);

    document.getElementById('msgId').value = '0x00000101';
    document.getElementById('msgBody').value = msgOpenVideo;
    writeMsg();
});

document.getElementById('btnCloseVideo').addEventListener('click', function () {
    document.getElementById('msgId').value = '0x00000103';
    document.getElementById('msgBody').value = '';
    writeMsg();
});

var _logMsgHeader, _logMsgBody, _logVideoFrame;
document.getElementById('logMsgHeader').addEventListener('change', function () {
    _logMsgHeader = this.checked;
});
document.getElementById('logMsgBody').addEventListener('change', function () {
    _logMsgBody = this.checked;
});
document.getElementById('logVideoFrame').addEventListener('change', function () {
    _logVideoFrame = this.checked;
});
},{"h264-converter":10,"url":5}],8:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var bit_stream_1 = require("./util/bit-stream");
var debug = require("./util/debug");
var NALU_1 = require("./util/NALU");
var H264Parser = (function () {
    function H264Parser(remuxer) {
        this.remuxer = remuxer;
        this.track = remuxer.mp4track;
    }
    H264Parser.prototype.parseSEI = function (sei) {
        var messages = H264Parser.readSEI(sei);
        for (var _i = 0, messages_1 = messages; _i < messages_1.length; _i++) {
            var m = messages_1[_i];
            switch (m.type) {
                case 0:
                    this.track.seiBuffering = true;
                    break;
                case 5:
                    return true;
                default:
                    break;
            }
        }
        return false;
    };
    H264Parser.prototype.parseSPS = function (sps) {
        var config = H264Parser.readSPS(sps);
        this.track.width = config.width;
        this.track.height = config.height;
        this.track.sps = [sps];
        this.track.codec = 'avc1.';
        var codecArray = new DataView(sps.buffer, sps.byteOffset + 1, 4);
        for (var i = 0; i < 3; ++i) {
            var h = codecArray.getUint8(i).toString(16);
            if (h.length < 2) {
                h = '0' + h;
            }
            this.track.codec += h;
        }
    };
    H264Parser.prototype.parsePPS = function (pps) {
        this.track.pps = [pps];
    };
    H264Parser.prototype.parseNAL = function (unit) {
        if (!unit) {
            return false;
        }
        var push = false;
        switch (unit.type()) {
            case NALU_1.default.NDR:
            case NALU_1.default.IDR:
                push = true;
                break;
            case NALU_1.default.SEI:
                push = this.parseSEI(unit.getData().subarray(4));
                break;
            case NALU_1.default.SPS:
                if (this.track.sps.length === 0) {
                    this.parseSPS(unit.getData().subarray(4));
                    debug.log(" Found SPS type NALU frame.");
                    if (!this.remuxer.readyToDecode && this.track.pps.length > 0 && this.track.sps.length > 0) {
                        this.remuxer.readyToDecode = true;
                    }
                }
                break;
            case NALU_1.default.PPS:
                if (this.track.pps.length === 0) {
                    this.parsePPS(unit.getData().subarray(4));
                    debug.log(" Found PPS type NALU frame.");
                    if (!this.remuxer.readyToDecode && this.track.pps.length > 0 && this.track.sps.length > 0) {
                        this.remuxer.readyToDecode = true;
                    }
                }
                break;
            default:
                debug.log(" Found Unknown type NALU frame. type=" + unit.type());
                break;
        }
        return push;
    };
    H264Parser.skipScalingList = function (decoder, count) {
        var lastScale = 8;
        var nextScale = 8;
        for (var j = 0; j < count; j++) {
            if (nextScale !== 0) {
                var deltaScale = decoder.readEG();
                nextScale = (lastScale + deltaScale + 256) % 256;
            }
            lastScale = (nextScale === 0) ? lastScale : nextScale;
        }
    };
    H264Parser.readSPS = function (data) {
        var decoder = new bit_stream_1.default(data);
        var frameCropLeftOffset = 0;
        var frameCropRightOffset = 0;
        var frameCropTopOffset = 0;
        var frameCropBottomOffset = 0;
        var sarScale = 1;
        decoder.readUByte();
        var profileIdc = decoder.readUByte();
        decoder.skipBits(5);
        decoder.skipBits(3);
        decoder.skipBits(8);
        decoder.skipUEG();
        if (profileIdc === 100 ||
            profileIdc === 110 ||
            profileIdc === 122 ||
            profileIdc === 244 ||
            profileIdc === 44 ||
            profileIdc === 83 ||
            profileIdc === 86 ||
            profileIdc === 118 ||
            profileIdc === 128) {
            var chromaFormatIdc = decoder.readUEG();
            if (chromaFormatIdc === 3) {
                decoder.skipBits(1);
            }
            decoder.skipUEG();
            decoder.skipUEG();
            decoder.skipBits(1);
            if (decoder.readBoolean()) {
                var scalingListCount = (chromaFormatIdc !== 3) ? 8 : 12;
                for (var i = 0; i < scalingListCount; ++i) {
                    if (decoder.readBoolean()) {
                        if (i < 6) {
                            H264Parser.skipScalingList(decoder, 16);
                        }
                        else {
                            H264Parser.skipScalingList(decoder, 64);
                        }
                    }
                }
            }
        }
        decoder.skipUEG();
        var picOrderCntType = decoder.readUEG();
        if (picOrderCntType === 0) {
            decoder.readUEG();
        }
        else if (picOrderCntType === 1) {
            decoder.skipBits(1);
            decoder.skipEG();
            decoder.skipEG();
            var numRefFramesInPicOrderCntCycle = decoder.readUEG();
            for (var i = 0; i < numRefFramesInPicOrderCntCycle; ++i) {
                decoder.skipEG();
            }
        }
        decoder.skipUEG();
        decoder.skipBits(1);
        var picWidthInMbsMinus1 = decoder.readUEG();
        var picHeightInMapUnitsMinus1 = decoder.readUEG();
        var frameMbsOnlyFlag = decoder.readBits(1);
        if (frameMbsOnlyFlag === 0) {
            decoder.skipBits(1);
        }
        decoder.skipBits(1);
        if (decoder.readBoolean()) {
            frameCropLeftOffset = decoder.readUEG();
            frameCropRightOffset = decoder.readUEG();
            frameCropTopOffset = decoder.readUEG();
            frameCropBottomOffset = decoder.readUEG();
        }
        if (decoder.readBoolean()) {
            if (decoder.readBoolean()) {
                var sarRatio = void 0;
                var aspectRatioIdc = decoder.readUByte();
                switch (aspectRatioIdc) {
                    case 1:
                        sarRatio = [1, 1];
                        break;
                    case 2:
                        sarRatio = [12, 11];
                        break;
                    case 3:
                        sarRatio = [10, 11];
                        break;
                    case 4:
                        sarRatio = [16, 11];
                        break;
                    case 5:
                        sarRatio = [40, 33];
                        break;
                    case 6:
                        sarRatio = [24, 11];
                        break;
                    case 7:
                        sarRatio = [20, 11];
                        break;
                    case 8:
                        sarRatio = [32, 11];
                        break;
                    case 9:
                        sarRatio = [80, 33];
                        break;
                    case 10:
                        sarRatio = [18, 11];
                        break;
                    case 11:
                        sarRatio = [15, 11];
                        break;
                    case 12:
                        sarRatio = [64, 33];
                        break;
                    case 13:
                        sarRatio = [160, 99];
                        break;
                    case 14:
                        sarRatio = [4, 3];
                        break;
                    case 15:
                        sarRatio = [3, 2];
                        break;
                    case 16:
                        sarRatio = [2, 1];
                        break;
                    case 255: {
                        sarRatio = [decoder.readUByte() << 8 | decoder.readUByte(), decoder.readUByte() << 8 | decoder.readUByte()];
                        break;
                    }
                    default: {
                        debug.error("  H264: Unknown aspectRatioIdc=" + aspectRatioIdc);
                    }
                }
                if (sarRatio) {
                    sarScale = sarRatio[0] / sarRatio[1];
                }
            }
            if (decoder.readBoolean()) {
                decoder.skipBits(1);
            }
            if (decoder.readBoolean()) {
                decoder.skipBits(4);
                if (decoder.readBoolean()) {
                    decoder.skipBits(24);
                }
            }
            if (decoder.readBoolean()) {
                decoder.skipUEG();
                decoder.skipUEG();
            }
            if (decoder.readBoolean()) {
                var unitsInTick = decoder.readUInt();
                var timeScale = decoder.readUInt();
                var fixedFrameRate = decoder.readBoolean();
                var frameDuration = timeScale / (2 * unitsInTick);
                debug.log("timescale: " + timeScale + "; unitsInTick: " + unitsInTick + "; " +
                    ("fixedFramerate: " + fixedFrameRate + "; avgFrameDuration: " + frameDuration));
            }
        }
        return {
            width: Math.ceil((((picWidthInMbsMinus1 + 1) * 16) - frameCropLeftOffset * 2 - frameCropRightOffset * 2) * sarScale),
            height: ((2 - frameMbsOnlyFlag) * (picHeightInMapUnitsMinus1 + 1) * 16) -
                ((frameMbsOnlyFlag ? 2 : 4) * (frameCropTopOffset + frameCropBottomOffset)),
        };
    };
    H264Parser.readSEI = function (data) {
        var decoder = new bit_stream_1.default(data);
        decoder.skipBits(8);
        var result = [];
        while (decoder.bitsAvailable > 3 * 8) {
            result.push(this.readSEIMessage(decoder));
        }
        return result;
    };
    H264Parser.readSEIMessage = function (decoder) {
        function get() {
            var result = 0;
            while (true) {
                var value = decoder.readUByte();
                result += value;
                if (value !== 0xff) {
                    break;
                }
            }
            return result;
        }
        var payloadType = get();
        var payloadSize = get();
        return this.readSEIPayload(decoder, payloadType, payloadSize);
    };
    H264Parser.readSEIPayload = function (decoder, type, size) {
        var result;
        switch (type) {
            default:
                result = { type: type };
                decoder.skipBits(size * 8);
        }
        decoder.skipBits(decoder.bitsAvailable % 8);
        return result;
    };
    return H264Parser;
}());
exports.default = H264Parser;

},{"./util/NALU":12,"./util/bit-stream":13,"./util/debug":14}],9:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var h264_parser_1 = require("./h264-parser");
var debug = require("./util/debug");
var NALU_1 = require("./util/NALU");
var trackId = 1;
var H264Remuxer = (function () {
    function H264Remuxer(fps, framePerFragment, timescale) {
        this.fps = fps;
        this.framePerFragment = framePerFragment;
        this.timescale = timescale;
        this.readyToDecode = false;
        this.totalDTS = 0;
        this.stepDTS = Math.round(this.timescale / this.fps);
        this.frameCount = 0;
        this.seq = 1;
        this.mp4track = {
            id: H264Remuxer.getTrackID(),
            type: 'video',
            len: 0,
            codec: '',
            sps: [],
            pps: [],
            seiBuffering: false,
            width: 0,
            height: 0,
            timescale: timescale,
            duration: timescale,
            samples: [],
            isKeyFrame: true,
        };
        this.unitSamples = [[]];
        this.parser = new h264_parser_1.default(this);
    }
    H264Remuxer.getTrackID = function () {
        return trackId++;
    };
    Object.defineProperty(H264Remuxer.prototype, "seqNum", {
        get: function () {
            return this.seq;
        },
        enumerable: true,
        configurable: true
    });
    H264Remuxer.prototype.remux = function (nalu) {
        if (this.mp4track.seiBuffering && nalu.type() === NALU_1.default.SEI) {
            return this.createNextFrame();
        }
        if (this.parser.parseNAL(nalu)) {
            this.unitSamples[this.unitSamples.length - 1].push(nalu);
            this.mp4track.len += nalu.getSize();
        }
        if (!this.mp4track.seiBuffering && (nalu.type() === NALU_1.default.IDR || nalu.type() === NALU_1.default.NDR)) {
            return this.createNextFrame();
        }
        return;
    };
    H264Remuxer.prototype.createNextFrame = function () {
        if (this.mp4track.len > 0) {
            this.frameCount++;
            if (this.frameCount % this.framePerFragment === 0) {
                var fragment = this.getFragment();
                if (fragment) {
                    var dts = this.totalDTS;
                    this.totalDTS = this.stepDTS * this.frameCount;
                    return [dts, fragment];
                }
                else {
                    debug.log("No mp4 sample data.");
                }
            }
            this.unitSamples.push([]);
        }
        return;
    };
    H264Remuxer.prototype.flush = function () {
        this.seq++;
        this.mp4track.len = 0;
        this.mp4track.samples = [];
        this.mp4track.isKeyFrame = false;
        this.unitSamples = [[]];
    };
    H264Remuxer.prototype.getFragment = function () {
        if (!this.checkReadyToDecode()) {
            return undefined;
        }
        var payload = new Uint8Array(this.mp4track.len);
        this.mp4track.samples = [];
        var offset = 0;
        for (var i = 0, len = this.unitSamples.length; i < len; i++) {
            var units = this.unitSamples[i];
            if (units.length === 0) {
                continue;
            }
            var mp4Sample = {
                size: 0,
                cts: this.stepDTS * i,
            };
            for (var _i = 0, units_1 = units; _i < units_1.length; _i++) {
                var unit = units_1[_i];
                mp4Sample.size += unit.getSize();
                payload.set(unit.getData(), offset);
                offset += unit.getSize();
            }
            this.mp4track.samples.push(mp4Sample);
        }
        if (offset === 0) {
            return undefined;
        }
        return payload;
    };
    H264Remuxer.prototype.checkReadyToDecode = function () {
        if (!this.readyToDecode || this.unitSamples.filter(function (array) { return array.length > 0; }).length === 0) {
            debug.log("Not ready to decode! readyToDecode(" + this.readyToDecode + ") is false or units is empty.");
            return false;
        }
        return true;
    };
    return H264Remuxer;
}());
exports.default = H264Remuxer;

},{"./h264-parser":8,"./util/NALU":12,"./util/debug":14}],10:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var h264_remuxer_1 = require("./h264-remuxer");
var mp4_generator_1 = require("./mp4-generator");
var debug = require("./util/debug");
var nalu_stream_buffer_1 = require("./util/nalu-stream-buffer");
exports.mimeType = 'video/mp4; codecs="avc1.42E01E"';
var debug_1 = require("./util/debug");
exports.setLogger = debug_1.setLogger;
var VideoConverter = (function () {
    function VideoConverter(element, fps, fpf) {
        if (fps === void 0) { fps = 60; }
        if (fpf === void 0) { fpf = fps; }
        this.element = element;
        this.fps = fps;
        this.fpf = fpf;
        this.receiveBuffer = new nalu_stream_buffer_1.default();
        this.queue = [];
        if (!MediaSource || !MediaSource.isTypeSupported(exports.mimeType)) {
            throw new Error("Your browser is not supported: " + exports.mimeType);
        }
        this.reset();
    }
    Object.defineProperty(VideoConverter, "errorNotes", {
        get: function () {
            return _a = {},
                _a[MediaError.MEDIA_ERR_ABORTED] = 'fetching process aborted by user',
                _a[MediaError.MEDIA_ERR_NETWORK] = 'error occurred when downloading',
                _a[MediaError.MEDIA_ERR_DECODE] = 'error occurred when decoding',
                _a[MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED] = 'audio/video not supported',
                _a;
            var _a;
        },
        enumerable: true,
        configurable: true
    });
    VideoConverter.prototype.setup = function () {
        var _this = this;
        this.mediaReadyPromise = new Promise(function (resolve, _reject) {
            _this.mediaSource.addEventListener('sourceopen', function () {
                debug.log("Media Source opened.");
                _this.sourceBuffer = _this.mediaSource.addSourceBuffer(exports.mimeType);
                _this.sourceBuffer.addEventListener('updateend', function () {
                    debug.log("  SourceBuffer updateend");
                    debug.log("    sourceBuffer.buffered.length=" + _this.sourceBuffer.buffered.length);
                    for (var i = 0, len = _this.sourceBuffer.buffered.length; i < len; i++) {
                        debug.log("    sourceBuffer.buffered [" + i + "]: " +
                            (_this.sourceBuffer.buffered.start(i) + ", " + _this.sourceBuffer.buffered.end(i)));
                    }
                    debug.log("  mediasource.duration=" + _this.mediaSource.duration);
                    debug.log("  mediasource.readyState=" + _this.mediaSource.readyState);
                    debug.log("  video.duration=" + _this.element.duration);
                    debug.log("    video.buffered.length=" + _this.element.buffered.length);
                    if (debug.isEnable()) {
                        for (var i = 0, len = _this.element.buffered.length; i < len; i++) {
                            debug.log("    video.buffered [" + i + "]: " + _this.element.buffered.start(i) + ", " + _this.element.buffered.end(i));
                        }
                    }
                    debug.log("  video.currentTime=" + _this.element.currentTime);
                    debug.log("  video.readyState=" + _this.element.readyState);
                    var data = _this.queue.shift();
                    if (data) {
                        _this.writeBuffer(data);
                    }
                });
                _this.sourceBuffer.addEventListener('error', function () {
                    debug.error('  SourceBuffer errored!');
                });
                _this.mediaReady = true;
                resolve();
            }, false);
            _this.mediaSource.addEventListener('sourceclose', function () {
                debug.log("Media Source closed.");
                _this.mediaReady = false;
            }, false);
            _this.element.src = URL.createObjectURL(_this.mediaSource);
        });
        return this.mediaReadyPromise;
    };
    VideoConverter.prototype.play = function () {
        var _this = this;
        if (!this.element.paused) {
            return;
        }
        if (this.mediaReady && this.element.readyState >= 2) {
            this.element.play();
        }
        else {
            var handler_1 = function () {
                _this.play();
                _this.element.removeEventListener('canplaythrough', handler_1);
            };
            this.element.addEventListener('canplaythrough', handler_1);
        }
    };
    VideoConverter.prototype.pause = function () {
        if (this.element.paused) {
            return;
        }
        this.element.pause();
    };
    VideoConverter.prototype.reset = function () {
        this.receiveBuffer.clear();
        if (this.mediaSource && this.mediaSource.readyState === 'open') {
            this.mediaSource.duration = 0;
            this.mediaSource.endOfStream();
        }
        this.mediaSource = new MediaSource();
        this.remuxer = new h264_remuxer_1.default(this.fps, this.fpf, this.fps * 60);
        this.mediaReady = false;
        this.mediaReadyPromise = undefined;
        this.queue = [];
        this.isFirstFrame = true;
        this.setup();
    };
    VideoConverter.prototype.appendRawData = function (data) {
        var nalus = this.receiveBuffer.append(data);
        for (var _i = 0, nalus_1 = nalus; _i < nalus_1.length; _i++) {
            var nalu = nalus_1[_i];
            var ret = this.remuxer.remux(nalu);
            if (ret) {
                this.writeFragment(ret[0], ret[1]);
            }
        }
    };
    VideoConverter.prototype.writeFragment = function (dts, pay) {
        var remuxer = this.remuxer;
        if (remuxer.mp4track.isKeyFrame) {
            this.writeBuffer(mp4_generator_1.default.initSegment([remuxer.mp4track], Infinity, remuxer.timescale));
        }
        if (pay && pay.byteLength) {
            debug.log(" Put fragment: " + remuxer.seqNum + ", frames=" + remuxer.mp4track.samples.length + ", size=" + pay.byteLength);
            var fragment = mp4_generator_1.default.fragmentSegment(remuxer.seqNum, dts, remuxer.mp4track, pay);
            this.writeBuffer(fragment);
            remuxer.flush();
        }
        else {
            debug.error("Nothing payload!");
        }
    };
    VideoConverter.prototype.writeBuffer = function (data) {
        var _this = this;
        if (this.mediaReady) {
            if (this.sourceBuffer.updating) {
                this.queue.push(data);
            }
            else {
                this.doAppend(data);
            }
        }
        else {
            this.queue.push(data);
            if (this.mediaReadyPromise) {
                this.mediaReadyPromise.then(function () {
                    if (!_this.sourceBuffer.updating) {
                        var d = _this.queue.shift();
                        if (d) {
                            _this.writeBuffer(d);
                        }
                    }
                });
                this.mediaReadyPromise = undefined;
            }
        }
    };
    VideoConverter.prototype.doAppend = function (data) {
        var error = this.element.error;
        if (error) {
            debug.error("MSE Error Occured: " + VideoConverter.errorNotes[error.code]);
            this.element.pause();
            if (this.mediaSource.readyState === 'open') {
                this.mediaSource.endOfStream();
            }
        }
        else {
            try {
                this.sourceBuffer.appendBuffer(data);
                debug.log("  appended buffer: size=" + data.byteLength);
            }
            catch (err) {
                debug.error("MSE Error occured while appending buffer. " + err.name + ": " + err.message);
            }
        }
    };
    return VideoConverter;
}());
exports.default = VideoConverter;

},{"./h264-remuxer":9,"./mp4-generator":11,"./util/debug":14,"./util/nalu-stream-buffer":15}],11:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var MP4 = (function () {
    function MP4() {
    }
    MP4.init = function () {
        MP4.initalized = true;
        MP4.types = {
            avc1: [],
            avcC: [],
            btrt: [],
            dinf: [],
            dref: [],
            esds: [],
            ftyp: [],
            hdlr: [],
            mdat: [],
            mdhd: [],
            mdia: [],
            mfhd: [],
            minf: [],
            moof: [],
            moov: [],
            mp4a: [],
            mvex: [],
            mvhd: [],
            sdtp: [],
            stbl: [],
            stco: [],
            stsc: [],
            stsd: [],
            stsz: [],
            stts: [],
            styp: [],
            tfdt: [],
            tfhd: [],
            traf: [],
            trak: [],
            trun: [],
            trep: [],
            trex: [],
            tkhd: [],
            vmhd: [],
            smhd: [],
        };
        for (var type in MP4.types) {
            if (MP4.types.hasOwnProperty(type)) {
                MP4.types[type] = [
                    type.charCodeAt(0),
                    type.charCodeAt(1),
                    type.charCodeAt(2),
                    type.charCodeAt(3),
                ];
            }
        }
        var hdlr = new Uint8Array([
            0x00,
            0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x76, 0x69, 0x64, 0x65,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x56, 0x69, 0x64, 0x65,
            0x6f, 0x48, 0x61, 0x6e,
            0x64, 0x6c, 0x65, 0x72, 0x00,
        ]);
        var dref = new Uint8Array([
            0x00,
            0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x01,
            0x00, 0x00, 0x00, 0x0c,
            0x75, 0x72, 0x6c, 0x20,
            0x00,
            0x00, 0x00, 0x01,
        ]);
        var stco = new Uint8Array([
            0x00,
            0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
        ]);
        MP4.STTS = MP4.STSC = MP4.STCO = stco;
        MP4.STSZ = new Uint8Array([
            0x00,
            0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
        ]);
        MP4.VMHD = new Uint8Array([
            0x00,
            0x00, 0x00, 0x01,
            0x00, 0x00,
            0x00, 0x00,
            0x00, 0x00,
            0x00, 0x00,
        ]);
        MP4.SMHD = new Uint8Array([
            0x00,
            0x00, 0x00, 0x00,
            0x00, 0x00,
            0x00, 0x00,
        ]);
        MP4.STSD = new Uint8Array([
            0x00,
            0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x01
        ]);
        MP4.FTYP = MP4.box(MP4.types.ftyp, new Uint8Array([
            0x69, 0x73, 0x6f, 0x35,
            0x00, 0x00, 0x00, 0x01,
            0x61, 0x76, 0x63, 0x31,
            0x69, 0x73, 0x6f, 0x35,
            0x64, 0x61, 0x73, 0x68,
        ]));
        MP4.STYP = MP4.box(MP4.types.styp, new Uint8Array([
            0x6d, 0x73, 0x64, 0x68,
            0x00, 0x00, 0x00, 0x00,
            0x6d, 0x73, 0x64, 0x68,
            0x6d, 0x73, 0x69, 0x78,
        ]));
        MP4.DINF = MP4.box(MP4.types.dinf, MP4.box(MP4.types.dref, dref));
        MP4.HDLR = MP4.box(MP4.types.hdlr, hdlr);
    };
    MP4.box = function (type) {
        var payload = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            payload[_i - 1] = arguments[_i];
        }
        var size = 8;
        for (var _a = 0, payload_1 = payload; _a < payload_1.length; _a++) {
            var p = payload_1[_a];
            size += p.byteLength;
        }
        var result = new Uint8Array(size);
        result[0] = (size >> 24) & 0xff;
        result[1] = (size >> 16) & 0xff;
        result[2] = (size >> 8) & 0xff;
        result[3] = size & 0xff;
        result.set(type, 4);
        size = 8;
        for (var _b = 0, payload_2 = payload; _b < payload_2.length; _b++) {
            var box = payload_2[_b];
            result.set(box, size);
            size += box.byteLength;
        }
        return result;
    };
    MP4.mdat = function (data) {
        return MP4.box(MP4.types.mdat, data);
    };
    MP4.mdhd = function (timescale) {
        return MP4.box(MP4.types.mdhd, new Uint8Array([
            0x00,
            0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x01,
            0x00, 0x00, 0x00, 0x02,
            (timescale >> 24) & 0xFF,
            (timescale >> 16) & 0xFF,
            (timescale >> 8) & 0xFF,
            timescale & 0xFF,
            0x00, 0x00, 0x00, 0x00,
            0x55, 0xc4,
            0x00, 0x00,
        ]));
    };
    MP4.mdia = function (track) {
        return MP4.box(MP4.types.mdia, MP4.mdhd(track.timescale), MP4.HDLR, MP4.minf(track));
    };
    MP4.mfhd = function (sequenceNumber) {
        return MP4.box(MP4.types.mfhd, new Uint8Array([
            0x00,
            0x00, 0x00, 0x00,
            (sequenceNumber >> 24),
            (sequenceNumber >> 16) & 0xFF,
            (sequenceNumber >> 8) & 0xFF,
            sequenceNumber & 0xFF,
        ]));
    };
    MP4.minf = function (track) {
        return MP4.box(MP4.types.minf, MP4.box(MP4.types.vmhd, MP4.VMHD), MP4.DINF, MP4.stbl(track));
    };
    MP4.moof = function (sn, baseMediaDecodeTime, track) {
        return MP4.box(MP4.types.moof, MP4.mfhd(sn), MP4.traf(track, baseMediaDecodeTime));
    };
    MP4.moov = function (tracks, duration, timescale) {
        var boxes = [];
        for (var _i = 0, tracks_1 = tracks; _i < tracks_1.length; _i++) {
            var track = tracks_1[_i];
            boxes.push(MP4.trak(track));
        }
        return MP4.box.apply(MP4, [MP4.types.moov, MP4.mvhd(timescale, duration), MP4.mvex(tracks)].concat(boxes));
    };
    MP4.mvhd = function (timescale, duration) {
        var bytes = new Uint8Array([
            0x00,
            0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x01,
            0x00, 0x00, 0x00, 0x02,
            (timescale >> 24) & 0xFF,
            (timescale >> 16) & 0xFF,
            (timescale >> 8) & 0xFF,
            timescale & 0xFF,
            (duration >> 24) & 0xFF,
            (duration >> 16) & 0xFF,
            (duration >> 8) & 0xFF,
            duration & 0xFF,
            0x00, 0x01, 0x00, 0x00,
            0x01, 0x00,
            0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x01, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x01, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x40, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x02,
        ]);
        return MP4.box(MP4.types.mvhd, bytes);
    };
    MP4.mvex = function (tracks) {
        var boxes = [];
        for (var _i = 0, tracks_2 = tracks; _i < tracks_2.length; _i++) {
            var track = tracks_2[_i];
            boxes.push(MP4.trex(track));
        }
        return MP4.box.apply(MP4, [MP4.types.mvex].concat(boxes, [MP4.trep()]));
    };
    MP4.trep = function () {
        return MP4.box(MP4.types.trep, new Uint8Array([
            0x00,
            0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x01,
        ]));
    };
    MP4.stbl = function (track) {
        return MP4.box(MP4.types.stbl, MP4.stsd(track), MP4.box(MP4.types.stts, MP4.STTS), MP4.box(MP4.types.stsc, MP4.STSC), MP4.box(MP4.types.stsz, MP4.STSZ), MP4.box(MP4.types.stco, MP4.STCO));
    };
    MP4.avc1 = function (track) {
        var sps = [];
        var pps = [];
        for (var _i = 0, _a = track.sps; _i < _a.length; _i++) {
            var data = _a[_i];
            var len = data.byteLength;
            sps.push((len >>> 8) & 0xFF);
            sps.push((len & 0xFF));
            sps = sps.concat(Array.prototype.slice.call(data));
        }
        for (var _b = 0, _c = track.pps; _b < _c.length; _b++) {
            var data = _c[_b];
            var len = data.byteLength;
            pps.push((len >>> 8) & 0xFF);
            pps.push((len & 0xFF));
            pps = pps.concat(Array.prototype.slice.call(data));
        }
        var avcc = MP4.box(MP4.types.avcC, new Uint8Array([
            0x01,
            sps[3],
            sps[4],
            sps[5],
            0xfc | 3,
            0xE0 | track.sps.length,
        ].concat(sps).concat([
            track.pps.length,
        ]).concat(pps)));
        var width = track.width;
        var height = track.height;
        return MP4.box(MP4.types.avc1, new Uint8Array([
            0x00, 0x00, 0x00,
            0x00, 0x00, 0x00,
            0x00, 0x01,
            0x00, 0x00,
            0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            (width >> 8) & 0xFF,
            width & 0xff,
            (height >> 8) & 0xFF,
            height & 0xff,
            0x00, 0x48, 0x00, 0x00,
            0x00, 0x48, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x01,
            0x12,
            0x62, 0x69, 0x6E, 0x65,
            0x6C, 0x70, 0x72, 0x6F,
            0x2E, 0x72, 0x75, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00,
            0x00, 0x18,
            0x11, 0x11
        ]), avcc, MP4.box(MP4.types.btrt, new Uint8Array([
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x2d, 0xc6, 0xc0,
            0x00, 0x2d, 0xc6, 0xc0,
        ])));
    };
    MP4.stsd = function (track) {
        return MP4.box(MP4.types.stsd, MP4.STSD, MP4.avc1(track));
    };
    MP4.tkhd = function (track) {
        var id = track.id;
        var width = track.width;
        var height = track.height;
        return MP4.box(MP4.types.tkhd, new Uint8Array([
            0x00,
            0x00, 0x00, 0x01,
            0x00, 0x00, 0x00, 0x01,
            0x00, 0x00, 0x00, 0x02,
            (id >> 24) & 0xFF,
            (id >> 16) & 0xFF,
            (id >> 8) & 0xFF,
            id & 0xFF,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00,
            0x00, 0x00,
            (track.type === 'audio' ? 0x01 : 0x00), 0x00,
            0x00, 0x00,
            0x00, 0x01, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x01, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x40, 0x00, 0x00, 0x00,
            (width >> 8) & 0xFF,
            width & 0xFF,
            0x00, 0x00,
            (height >> 8) & 0xFF,
            height & 0xFF,
            0x00, 0x00,
        ]));
    };
    MP4.traf = function (track, baseMediaDecodeTime) {
        var id = track.id;
        return MP4.box(MP4.types.traf, MP4.box(MP4.types.tfhd, new Uint8Array([
            0x00,
            0x02, 0x00, 0x00,
            (id >> 24),
            (id >> 16) & 0XFF,
            (id >> 8) & 0XFF,
            (id & 0xFF),
        ])), MP4.box(MP4.types.tfdt, new Uint8Array([
            0x00,
            0x00, 0x00, 0x00,
            (baseMediaDecodeTime >> 24),
            (baseMediaDecodeTime >> 16) & 0XFF,
            (baseMediaDecodeTime >> 8) & 0XFF,
            (baseMediaDecodeTime & 0xFF),
        ])), MP4.trun(track, 16 +
            16 +
            8 +
            16 +
            8 +
            8));
    };
    MP4.trak = function (track) {
        track.duration = track.duration || 0xffffffff;
        return MP4.box(MP4.types.trak, MP4.tkhd(track), MP4.mdia(track));
    };
    MP4.trex = function (track) {
        var id = track.id;
        return MP4.box(MP4.types.trex, new Uint8Array([
            0x00,
            0x00, 0x00, 0x00,
            (id >> 24),
            (id >> 16) & 0XFF,
            (id >> 8) & 0XFF,
            (id & 0xFF),
            0x00, 0x00, 0x00, 0x01,
            0x00, 0x00, 0x00, 0x3c,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x01, 0x00, 0x00,
        ]));
    };
    MP4.trun = function (track, offset) {
        var samples = track.samples || [];
        var len = samples.length;
        var additionalLen = track.isKeyFrame ? 4 : 0;
        var arraylen = 12 + additionalLen + (4 * len);
        var array = new Uint8Array(arraylen);
        offset += 8 + arraylen;
        array.set([
            0x00,
            0x00, 0x02, (track.isKeyFrame ? 0x05 : 0x01),
            (len >>> 24) & 0xFF,
            (len >>> 16) & 0xFF,
            (len >>> 8) & 0xFF,
            len & 0xFF,
            (offset >>> 24) & 0xFF,
            (offset >>> 16) & 0xFF,
            (offset >>> 8) & 0xFF,
            offset & 0xFF,
        ], 0);
        if (track.isKeyFrame) {
            array.set([
                0x00, 0x00, 0x00, 0x00,
            ], 12);
        }
        for (var i = 0; i < len; i++) {
            var sample = samples[i];
            var size = sample.size;
            array.set([
                (size >>> 24) & 0xFF,
                (size >>> 16) & 0xFF,
                (size >>> 8) & 0xFF,
                size & 0xFF,
            ], 12 + additionalLen + 4 * i);
        }
        return MP4.box(MP4.types.trun, array);
    };
    MP4.initSegment = function (tracks, duration, timescale) {
        if (!MP4.initalized) {
            MP4.init();
        }
        var movie = MP4.moov(tracks, duration, timescale);
        var result = new Uint8Array(MP4.FTYP.byteLength + movie.byteLength);
        result.set(MP4.FTYP);
        result.set(movie, MP4.FTYP.byteLength);
        return result;
    };
    MP4.fragmentSegment = function (sn, baseMediaDecodeTime, track, payload) {
        var moof = MP4.moof(sn, baseMediaDecodeTime, track);
        var mdat = MP4.mdat(payload);
        var result = new Uint8Array(MP4.STYP.byteLength + moof.byteLength + mdat.byteLength);
        result.set(MP4.STYP);
        result.set(moof, MP4.STYP.byteLength);
        result.set(mdat, MP4.STYP.byteLength + moof.byteLength);
        return result;
    };
    return MP4;
}());
MP4.types = {};
MP4.initalized = false;
exports.default = MP4;

},{}],12:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var NALU = (function () {
    function NALU(data) {
        this.data = data;
        this.nri = (data[0] & 0x60) >> 5;
        this.ntype = data[0] & 0x1f;
    }
    Object.defineProperty(NALU, "NDR", {
        get: function () { return 1; },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NALU, "IDR", {
        get: function () { return 5; },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NALU, "SEI", {
        get: function () { return 6; },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NALU, "SPS", {
        get: function () { return 7; },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NALU, "PPS", {
        get: function () { return 8; },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NALU, "TYPES", {
        get: function () {
            return _a = {},
                _a[NALU.IDR] = 'IDR',
                _a[NALU.SEI] = 'SEI',
                _a[NALU.SPS] = 'SPS',
                _a[NALU.PPS] = 'PPS',
                _a[NALU.NDR] = 'NDR',
                _a;
            var _a;
        },
        enumerable: true,
        configurable: true
    });
    NALU.type = function (nalu) {
        if (nalu.ntype in NALU.TYPES) {
            return NALU.TYPES[nalu.ntype];
        }
        else {
            return 'UNKNOWN';
        }
    };
    NALU.prototype.type = function () {
        return this.ntype;
    };
    NALU.prototype.isKeyframe = function () {
        return this.ntype === NALU.IDR;
    };
    NALU.prototype.getSize = function () {
        return 4 + this.data.byteLength;
    };
    NALU.prototype.getData = function () {
        var result = new Uint8Array(this.getSize());
        var view = new DataView(result.buffer);
        view.setUint32(0, this.getSize() - 4);
        result.set(this.data, 4);
        return result;
    };
    return NALU;
}());
exports.default = NALU;

},{}],13:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var BitStream = (function () {
    function BitStream(data) {
        this.data = data;
        this.index = 0;
        this.bitLength = data.byteLength * 8;
    }
    Object.defineProperty(BitStream.prototype, "bitsAvailable", {
        get: function () {
            return this.bitLength - this.index;
        },
        enumerable: true,
        configurable: true
    });
    BitStream.prototype.skipBits = function (size) {
        if (this.bitsAvailable < size) {
            throw new Error('no bytes available');
        }
        this.index += size;
    };
    BitStream.prototype.readBits = function (size) {
        var result = this.getBits(size, this.index);
        return result;
    };
    BitStream.prototype.getBits = function (size, offsetBits, moveIndex) {
        if (moveIndex === void 0) { moveIndex = true; }
        if (this.bitsAvailable < size) {
            throw new Error('no bytes available');
        }
        var offset = offsetBits % 8;
        var byte = this.data[(offsetBits / 8) | 0] & (0xff >>> offset);
        var bits = 8 - offset;
        if (bits >= size) {
            if (moveIndex) {
                this.index += size;
            }
            return byte >> (bits - size);
        }
        else {
            if (moveIndex) {
                this.index += bits;
            }
            var nextSize = size - bits;
            return (byte << nextSize) | this.getBits(nextSize, offsetBits + bits, moveIndex);
        }
    };
    BitStream.prototype.skipLZ = function () {
        var leadingZeroCount;
        for (leadingZeroCount = 0; leadingZeroCount < this.bitLength - this.index; ++leadingZeroCount) {
            if (0 !== this.getBits(1, this.index + leadingZeroCount, false)) {
                this.index += leadingZeroCount;
                return leadingZeroCount;
            }
        }
        return leadingZeroCount;
    };
    BitStream.prototype.skipUEG = function () {
        this.skipBits(1 + this.skipLZ());
    };
    BitStream.prototype.skipEG = function () {
        this.skipBits(1 + this.skipLZ());
    };
    BitStream.prototype.readUEG = function () {
        var prefix = this.skipLZ();
        return this.readBits(prefix + 1) - 1;
    };
    BitStream.prototype.readEG = function () {
        var value = this.readUEG();
        if (0x01 & value) {
            return (1 + value) >>> 1;
        }
        else {
            return -1 * (value >>> 1);
        }
    };
    BitStream.prototype.readBoolean = function () {
        return 1 === this.readBits(1);
    };
    BitStream.prototype.readUByte = function () {
        return this.readBits(8);
    };
    BitStream.prototype.readUShort = function () {
        return this.readBits(16);
    };
    BitStream.prototype.readUInt = function () {
        return this.readBits(32);
    };
    return BitStream;
}());
exports.default = BitStream;

},{}],14:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var logger;
var errorLogger;
function setLogger(log, error) {
    logger = log;
    errorLogger = error != null ? error : log;
}
exports.setLogger = setLogger;
function isEnable() {
    return logger != null;
}
exports.isEnable = isEnable;
function log(message) {
    var optionalParams = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        optionalParams[_i - 1] = arguments[_i];
    }
    if (logger) {
        logger.apply(void 0, [message].concat(optionalParams));
    }
}
exports.log = log;
function error(message) {
    var optionalParams = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        optionalParams[_i - 1] = arguments[_i];
    }
    if (errorLogger) {
        errorLogger.apply(void 0, [message].concat(optionalParams));
    }
}
exports.error = error;

},{}],15:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var NALU_1 = require("./NALU");
var VideoStreamBuffer = (function () {
    function VideoStreamBuffer() {
    }
    VideoStreamBuffer.prototype.clear = function () {
        this.buffer = undefined;
    };
    VideoStreamBuffer.prototype.append = function (value) {
        var nextNalHeader = function (b) {
            var i = 3;
            return function () {
                var count = 0;
                for (; i < b.length; i++) {
                    switch (b[i]) {
                        case 0:
                            count++;
                            break;
                        case 1:
                            if (count === 3) {
                                return i - 3;
                            }
                        default:
                            count = 0;
                    }
                }
                return;
            };
        };
        var result = [];
        var buffer;
        if (this.buffer) {
            if (value[3] === 1 && value[2] === 0 && value[1] === 0 && value[0] === 0) {
                result.push(new NALU_1.default(this.buffer.subarray(4)));
                buffer = Uint8Array.from(value);
            }
        }
        if (buffer == null) {
            buffer = this.mergeBuffer(value);
        }
        var lastIndex = 0;
        var f = nextNalHeader(buffer);
        for (var index = f(); index != null; index = f()) {
            result.push(new NALU_1.default(buffer.subarray(lastIndex + 4, index)));
            lastIndex = index;
        }
        this.buffer = buffer.subarray(lastIndex);
        return result;
    };
    VideoStreamBuffer.prototype.mergeBuffer = function (value) {
        if (this.buffer == null) {
            return Uint8Array.from(value);
        }
        else {
            var newBuffer = new Uint8Array(this.buffer.byteLength + value.length);
            if (this.buffer.byteLength > 0) {
                newBuffer.set(this.buffer, 0);
            }
            newBuffer.set(value, this.buffer.byteLength);
            return newBuffer;
        }
    };
    return VideoStreamBuffer;
}());
exports.default = VideoStreamBuffer;

},{"./NALU":12}]},{},[7]);
