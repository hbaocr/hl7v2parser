/*
 ------------------------
 (c) 2017-present Panates
 This file may be freely distributed under the MIT license.
*/

const {ArgumentError} = require('errorex');
const HL7Field = require('./HL7Field');
const {capitalizeFirst} = require('./helpers');
const ParseError = require('./ParseError');
const path = require('path');

const {
  ESCAPE_CHARACTER
} = require('./types');

/**
 *
 * @class
 */
class HL7Segment {

  /**
   *
   * @param {HL7Message} message
   * @param {Object} [options]
   * @param {Object} [options.customDict]
   * @param {String} [delimiters]

   */
  constructor(message, options, delimiters) {
    Object.defineProperty(this, '_message', {
      value: message,
      enumerable: false
    });
    this._type = null;
    this._fields = null;
    if (options && options.customDict)
      this._customDict = options.customDict;
    this._delimiters = delimiters || '';
  }

  getDict(version) {
    const dict = require(path.resolve(__dirname, 'dictionary', version));
    return {
      fields: {
        ...dict.fields,
        ...(this._customDict || {}).fields
      },
      segments: {
        ...dict.segments,
        ...(this._customDict || {}).segments
      }
    };
  }

  /**
   *
   * @return {HL7Message}
   */
  get message() {
    return this._message;
  }

  /**
   *
   * @return {string}
   */
  get type() {
    return this._type;
  }

  /**
   *
   * @return {Object<string,HL7Field>}
   */
  get fields() {
    return this._fields;
  }

  get index() {
    return this.message.segments.indexOf(this);
  }

  get asHL7() {
    return this.toHL7();
  }

  set asHL7(v) {
    this.parse(v);
  }

  defineField(sequence, def) {
    if (!(sequence > 0))
      throw new ArgumentError('Sequence argument must be greater than zero');
    if (typeof def !== 'object')
      throw new ArgumentError('You must provide config object');

    const dict = this.getDict(this.message.version);
    const dataType = def.dt;
    const fldDict = dict.fields[dataType];
    if (!fldDict)
      throw new ArgumentError('Unknown HL7 field (%s)', dataType);

    const index = sequence - 1;
    const name = def.desc ?
        def.desc.replace(/[^\w]/g, '') :
        'CustomField' + sequence;
    const field = this._fields[index] = new HL7Field(this, name, def, this._customDict, this._delimiters);
    delete this[sequence];
    delete this[name];
    Object.defineProperty(this, sequence, {
      get: () => this.fields[index],
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(this, name, {
      get: () => this.fields[index],
      enumerable: false,
      configurable: true
    });
    return field;
  }

  parse(str) {
    const values = str.split(this._delimiters[0]);
    if (str.startsWith('MSH')) {
      values.splice(1, 0, this._delimiters[0]);
      values[12] = values[12] || this.message.version;
      this.message.version = values[12];
    }
    const segmentType = values[0];
    const sequence = values[1];
    const dict = this.getDict(this.message.version);
    const segDict = dict.segments[segmentType];
    if (!segDict) {
      const e = new ParseError('Unknown HL7 segment type (%s)', segmentType);
      e.segmentId = segmentType;
      throw e;
    }
    this._type = segmentType;
    this._fields = [];
    for (const [i, f] of segDict.fields.entries())
      try {
        this.defineField(i + 1, f);
      } catch (e) /* istanbul ignore next : hard to evaluate */ {
        const err = new ParseError(e);
        err.segmentId = segmentType;
        err.sequence = sequence;
        err.fieldPosition = i + 1;
        throw new ParseError(err);
      }

    for (const [i, v] of values.entries()) {
      if (!i)
        continue;
      try {
        const f = this.fields[i - 1] || this.defineField(i, {dt: 'ST'});
        f.parse(v);
      } catch (e) {
        /*istanbul ignore next*/
        const err = (e instanceof ParseError) ? e : new ParseError(e);
        err.segmentId = segmentType;
        err.sequence = sequence;
        err.fieldPosition = i + 1;
        throw err;
      }

    }
  }

  toHL7() {
    let out = '';
    for (let i = this._fields.length - 1; i >= 0; i--) {
      const f = this._fields[i];
      if (this.type !== 'MSH' || i > 1) {
        if (out || f.length)
          out = f.toHL7() + (out ? this._delimiters[0] : '') + out;
      }
    }
    return this.type + this._delimiters[0] +
        (this.type === 'MSH' ?
            this._delimiters[2] +
            this._delimiters[1] +
            ESCAPE_CHARACTER +
            this._delimiters[3] +
            this._delimiters[0] : '') +
        out;
  }

  view() {
    const out = {};
    for (const f of this._fields) {
      out[f.name] = f.view();
    }
    return out;
  }
}

module.exports = HL7Segment;