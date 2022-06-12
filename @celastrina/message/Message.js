/*
 * Copyright (c) 2021, KRI, LLC.
 *
 * MIT License
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
"use strict";
const {Context, BaseFunction, AddOn, LifeCycle, LOG_LEVEL, instanceOfCelastrinaType, CelastrinaError,
	   CelastrinaValidationError} = require("@celastrina/core")
const moment = require("moment");
const {v4: uuidv4} = require("uuid");

/**
 * Marshaller
 * @author Robert R Murrell
 */
class Marshaller {
	constructor(contentType = "text/plain") {
		this._contentType = contentType;
	}
	get contentType() {return this._contentType;}
	async unmarshal(value) {return value;}
	async marshal(value) {return value;}
}
/**
 * JSONMarshaller
 * @author Robert R Murrell
 */
class JSONMarshaller extends Marshaller {
	constructor(contentType = "application/json") {
		super(contentType);
	}
	async unmarshal(value) {
		return JSON.parse(value);
	}
	async marshal(value) {
		return JSON.stringify(value);
	}
}
/**
 * FilterChain
 * @author Robert R Murrell
 */
class FilterChain {
	/**@return{Object}*/static $object() {return {schema: "https://celastrinajs/schema/v1.0.0/message/FilterChain#",
		                                          type: "celastrinajs.message.FilterChain"};}
	/**
	 * @param {string} attribute
	 * @param {RegExp} regexp
	 * @param {FilterChain} link
	 */
	constructor(attribute, regexp , link = null) {
		this._attribute = attribute;
		this._regexp = regexp;
		this._link = link;
	}
	/**
	 * @param {FilterChain} link
	 */
	addLink(link) {
		if(!instanceOfCelastrinaType(FilterChain, link))
			throw CelastrinaValidationError.newValidationError(
				"Attribute 'link' is required and must be of type '" + FilterChain.$object.type + "'.", "link");
		(this._link == null) ? this._link = link : this._link.addLink(link);
	}
	/**@return{FilterChain}*/get link() {return this._link;}
	/**@return{RegExp}*/get expression() {return this._regexp;}
	/**@param{RegExp}expression*/set expression(expression) {this._regexp = expression;}
	/**
	 * @param {(string|Object)} value
	 * @return boolean
	 */
	doFilter(value) {
		if(typeof value === "string") return this._doFilter(value);
	}
	/**
	 * @param {string} value
	 * @return boolean
	 * @private
	 */
	_doFilter(value) {
		if(this._regexp.test(value))
			if(this._link != null) return this._link._doFilter(value);
			else return false;
	}
}
/**
 * BaseMessageContext
 * @author Robert R Murrell
 */
class BaseMessageContext extends Context {
	static get $object() {return {schema: "https://celastrinajs/schema/v1.0.0/message/BaseMessageContext#",
		                          type: "celastrinajs.message.BaseMessageContext"};}
	/**
	 * @param {Configuration} config
	 */
	constructor(config) {
		super(config);
		/**@type{boolean}*/this._rejected = false;
		/**@type{boolean}*/this._aborted = true;
		/**@type{CelastrinaError}*/this._reason = null;
	}
	/**@return{boolean}*/get rejected() {return this._rejected;}
	/**@param{boolean}rejected*/set rejected(rejected) {this._rejected = rejected;}
	/**@return{boolean}*/get aborted() {return this._rejected;}
	/**@param{boolean}aborted*/set aborted(aborted) {this._aborted = aborted;}
	/**@return{CelastrinaError}*/get reason() {return this._reason;}
	/**@param{CelastrinaError}reason*/set reason(reason) {this._reason = reason;}
	/**
	 * @param {*} reason
	 */
	reject(reason = null) {
		this._rejected = true;
		if(reason != null) this._reason = CelastrinaError.wrapError(reason);
	}
	/**
	 * @param {*} reason
	 */
	abort(reason = null) {
		this._aborted = true;
		if(reason != null) this._reason = CelastrinaError.wrapError(reason);
	}
}
/**
 * CloudEventFunction
 * @author Robert R Murrell
 */
class BaseMessageFunction extends BaseFunction {
	static get $object() {return {schema: "https://celastrinajs/schema/v1.0.0/message/BaseMessageFunction#",
		                          type: "celastrinajs.message.BaseMessageFunction"};}
	/**
	 * @param {Configuration} config
	 */
	constructor(config) {super(config);}
	/**
	 * @param {Configuration} config
	 * @return {Promise<(Context|BaseMessageContext)>}
	 */
	async createContext(config) {return new BaseMessageContext(config);}
	/**
	 * @param {Context|BaseMessageContext} context
	 * @returns {Promise<void>}
	 */
	async handleProcessLifeCycle(context) {}
	/**
	 * @param {BaseMessageContext} context
	 * @returns {Promise<void>}
	 */
	async onReject(context) {}
	/**
	 * @param {BaseMessageContext} context
	 * @param {(null|Error|CelastrinaError|CelastrinaValidationError)} exception
	 * @returns {Promise<void>}
	 */
	async onAbort(context, exception = null) {}
}
/**
 * CloudEventAddOn
 * @author Robert R Murrell
 */
class BaseMessageAddOn extends AddOn {
	/**@returns{Object}*/static get $object() {return {schema: "https://celastrinajs/schema/v1.0.0/message/BaseMessageAddOn#",
		type: "celastrinajs.message.BaseMessageAddOn",
		addOn: "celastrinajs.addon.msg.cloudevent"};}
	constructor() {
		super([], [LifeCycle.STATE.INITIALIZE, LifeCycle.STATE.PROCESS]);
		/**@type{FilterChain}*/this._filters = null;
		/**@type{Marshaller}*/this._marshaller = null;
		this._abortOnReject = true;
	}
	get filters() {return this._filters;}
	get marshaller() {return this._marshaller;}
	/**@return{boolean}*/get abortOnReject() {return this._abortOnReject;}

	/**
	 * @param {LifeCycle} lifecycle
	 * @returns {Promise<void>}
	 */
	async doLifeCycle(lifecycle) {
		if(instanceOfCelastrinaType(BaseMessageContext, lifecycle.context)) {
			switch(lifecycle.lifecycle) {
				case LifeCycle.STATE.INITIALIZE:
					await this._handleInitialize(lifecycle.context, lifecycle.source);
					break;
				case LifeCycle.STATE.PROCESS:
					await this._handleProcess(lifecycle.context, lifecycle.source);
					break;
				default:
					lifecycle.context.log("Unsupported lifecycle invoked '" + lifecycle.lifecycle + ".",
						LOG_LEVEL.WARN, "BaseMessageAddOn.doLifeCycle(lifecycle)");
			}
		}
		else {
			lifecycle.context.log("Invalid context type, expected 'BaseMessageContext'. Are you sure you used the 'CloudEventFunction'?",
				LOG_LEVEL.ERROR, "BaseMessageAddOn.doLifeCycle(lifecycle)");
			throw CelastrinaError.newError("Invalid context type for add-on.");
		}
	}
	/**
	 * @param {(Context|BaseMessageContext)} context
	 * @param {(BaseFunction|BaseMessageFunction)} source
	 * @return {Promise<void>}
	 * @private
	 */
	async _handleInitialize(context, source) {
		//
	}
	/**
	 * @param {BaseMessageContext} context
	 * @param {BaseMessageFunction} source
	 * @return {Promise<void>}
	 * @private
	 */
	async _checkRejected(context, source) {
		if(context.rejected) {
			await source.onReject(context);
			if(this._abortOnReject) {
				context.aborted = true;
				return source.onAbort(context);
			}
		}
	}
	/**
	 * @param {(Context|BaseMessageContext)} context
	 * @param {(BaseFunction|BaseMessageFunction)} source
	 * @return {Promise<void>}
	 * @private
	 */
	async _handleProcess(context, source) {
		try {
			// TODO: Apply filters...

			// TODO: Check Expired...

			await this._checkRejected(context, source);
			await source.handleProcessLifeCycle(context);
			await this._checkRejected(context, source);
		}
		catch(exception) {
			return source.onAbort(context, exception);
		}
	}
}











/**
 * CloudEventMarshaller
 * @author Robert R Murrell
 */
class JSONCloudEventMarshaller extends JSONMarshaller {
	constructor() {
		super("application/cloudevents+json");
	}
	async unmarshal(value) {
		let _CloudEvent = await super.unmarshal(value);
		if(typeof _CloudEvent !== "object" || _CloudEvent == null)
			throw CelastrinaValidationError.newValidationError("", "_CloudEvent");
		if(!_CloudEvent.hasOwnProperty("id") || typeof _CloudEvent.id !== "string" ||
			_CloudEvent.id.trim().length === 0)
			throw CelastrinaValidationError.newValidationError("Attribute 'id' is required.", "_CloudEvent.id");
		if(!_CloudEvent.hasOwnProperty("specversion") || typeof _CloudEvent.specversion !== "string" ||
			_CloudEvent.specversion.trim() !== "1.0")
			throw CelastrinaValidationError.newValidationError("Attribute 'id' is required.", "_CloudEvent.id");
		if(!_CloudEvent.hasOwnProperty("type") || typeof _CloudEvent.type !== "string" ||
			_CloudEvent.type.trim().length === 0)
			throw CelastrinaValidationError.newValidationError("Attribute 'type' is required.", "_CloudEvent.type");
		if(!_CloudEvent.hasOwnProperty("source") || typeof _CloudEvent.source !== "string" ||
			_CloudEvent.source.trim().length === 0)
			throw CelastrinaValidationError.newValidationError("Attribute 'source' is required.", "_CloudEvent.source");
		if(!_CloudEvent.hasOwnProperty("datacontenttype") || typeof _CloudEvent.datacontenttype !== "string" ||
			_CloudEvent.datacontenttype.trim().length === 0)
			throw CelastrinaValidationError.newValidationError("Attribute 'datacontenttype' is required.", "_CloudEvent.datacontenttype");

		let _subject = null;
		if(_CloudEvent.hasOwnProperty("subject") && _CloudEvent.subject != null) {
			if(typeof _CloudEvent.subject === "string" && _CloudEvent.subject.trim().length > 0)
				_subject = _CloudEvent.subject.trim();
		}
		let _timestamp = null;
		if(_CloudEvent.hasOwnProperty("timestamp") && _CloudEvent.subject != null) {
			if(typeof _CloudEvent.subject === "string" && _CloudEvent.subject.trim().length > 0)
				_subject = moment(_CloudEvent.subject.trim());
		}
	}
	async marshal(value) {
		//
	}
}
/**
 * CloudEvent
 * @author Robert R Murrell
 */
class CloudEvent {
	/**@return{Object}*/static $object() {return {schema: "https://celastrinajs/schema/v1.0.0/message/CloudEvent#",
		                                          type: "celastrinajs.message.CloudEvent"};}
	/**
	 * @param {string} [id=uuidv4()]
	 * @param {*} [data=null]
	 * @param {(null|string)} type
	 * @param {(null|string)} source
	 * @param {(null|string)} subject
	 * @param {moment.Moment} [timestamp=moment()]
	 * @param {string} [specversion="1.0"]
	 * @param {string} [datacontenttype="application/json"]
	 */
	constructor(id = uuidv4(), data = null, type = null, source = null, subject = null,
	            datacontenttype = "application/json", timestamp = moment(), specversion = "1.0", ) {
		this._id = id;
		this._data = data;
		this._type = type;
		this._source = source;
		this._subject = subject;
		this._timestamp = timestamp;
		this._specversion = specversion;
		this._datacontenttype = datacontenttype;
	}
	/**@return{string}*/get id() {return this._id;}
	/**@return{*}*/get data() {return this._data;}
	/**@return{(null|string)}*/get type() {return this._type;}
	/**@return{(null|string)}*/get source() {return this._source;}
	/**@return{(null|string)}*/get subject() {return this._subject;}
	/**@return{moment.Moment}*/get timeStamp() {return this._timestamp;}
	/**@return{string}*/get specVersion() {return this._specversion;}
	/**@return{string}*/get dataContentType() {return this._datacontenttype;}
	/**
	 * @param {moment.DurationInputArg1} maxAge
	 * @param {moment.DurationInputArg2} unit
	 * @return {Promise<boolean>}
	 */
	async isExpired(maxAge = "24", unit = "hours") {
		let _expireDateTime = moment();
		_expireDateTime.subtract(maxAge, unit);
		return this._timestamp.isSameOrBefore(_expireDateTime);
	}
	/**
	 * @param {*} data
	 * @param {string} dataContentType
	 * @return {Promise<CloudEvent>}
	 */
	async cloneWithNewData(data = null, dataContentType = "application/json") {
		return new CloudEvent(uuidv4(), data, this._type, this._source, this._subject, dataContentType);
	}
}
/**
 * CloudEventContext
 * @author Robert R Murrell
 */
class CloudEventContext extends BaseMessageContext {
	static get $object() {return {schema: "https://celastrinajs/schema/v1.0.0/message/EventContext#",
		                          type: "celastrinajs.message.EventContext"};}
	/**
	 * @param {Configuration} config
	 */
	constructor(config) {
		super(config);
		/**@type{CloudEvent}*/this._cloudevent = null;
	}
	/**@return{(null|undefined|Object|CloudEvent)}*/async getEvent() {return this.getBinding("event");}
	/**@return{CloudEvent}*/get cloudEvent() {return this._cloudevent;}
	/**@param{CloudEvent}event*/set cloudEvent(event) {this._cloudevent = event;}
}

/**
 * CloudEventFunction
 * @author Robert R Murrell
 */
class CloudEventFunction extends BaseMessageFunction {
	static get $object() {return {schema: "https://celastrinajs/schema/v1.0.0/message/BaseMessageFunction#",
		                          type: "celastrinajs.message.BaseMessageFunction"};}
	/**
	 * @param {Configuration} config
	 */
	constructor(config) {super(config);}
	/**
	 * @param {Configuration} config
	 * @return {Promise<CloudEventContext>}
	 */
	async createContext(config) {return new CloudEventContext(config);}
	/**
	 * @param {BaseMessageContext|CloudEventContext} context
	 * @returns {Promise<void>}
	 */
	async handleProcessLifeCycle(context) {
		return this.onEvent(context);
	}
	/**
	 * @param {CloudEventContext} context
	 * @returns {Promise<void>}
	 */
	async onEvent(context) {}
}
/**
 * CloudEventAddOn
 * @author Robert R Murrell
 */
class CloudEventAddOn extends BaseMessageAddOn {
	/**@returns{Object}*/static get $object() {return {schema: "https://celastrinajs/schema/v1.0.0/message/CloudEventAddOn#",
		                                               type: "celastrinajs.message.CloudEventAddOn",
		                                               addOn: "celastrinajs.addon.msg.cloudevent"};}
	constructor() {
		super();
	}
}
















/**
 * MessageAuthorization
 * @author Robert R Murrell
 */
class MessageAuthorization {

}
/**
 * Header
 * @author Robert R Murrell
 */
class Header {
	static get $object() {return {schema: "https://celastrinajs/schema/v1.0.0/message/Header#",
		                          type: "celastrinajs.message.Header"};}
	static MESSAGE_TYPE = "com.celastrinajs.message.Message";
	static MESSAGE_VERSION = "1.0.0";
	/**
	 * @param {string} [id=uuidv4()]
	 * @param {string} [correlationId=uuidv4()]
	 * @param {(null|string)} [type="com.celastrinajs.message.Message"]
	 * @param {(null|string)} [version="1.0.0"]
	 * @param {(null|string)} [source=null]
	 * @param {(null|string)} [subject=null]
	 * @param {(null|string)} [action=null]
	 * @param {(null|string)} [enqueueTime=null]
	 * @param {moment.Moment} [createTime=null]
	 * @param {moment.Moment} [expireTime=null]
	 * @param {number} [deliveryCount=0]
	 * @param {MessageAuthorization} [authorization=null]
	 */
	constructor(id = uuidv4(), correlationId = uuidv4(), type = Header.MESSAGE_TYPE,
	            version = Header.MESSAGE_VERSION, source = null, subject = null,
	            action = null, enqueueTime = null, createTime = null, expireTime = null,
	            deliveryCount = 0, authorization = null) {
		this._id = id;
		this._correlationId = correlationId;
		this._type = type;
		this._source = source;
		this._subject = subject;
		this._action = action;
		/**@type{moment.Moment}*/this._enqueueTime = enqueueTime;
		/**@type{moment.Moment}*/this._createTime = createTime;
		/**@type{moment.Moment}*/this._expireTime = expireTime;
		this._deliveryCount = deliveryCount;
		this._authorization = authorization;
	}
	/**@return{string}*/get id() {return this._id;}
	/**@return{string}*/get correlationId() {return this._id;}
	/**@return{(null|string)}*/get type() {return this._type;}
	/**@return{(null|string)}*/get source() {return this._source;}
	/**@return{(null|string)}*/get subject() {return this._subject;}
	/**@return{(null|string)}*/get action() {return this._action;}
	/**@return{moment.Moment}*/get createTime() {return this._createTime;}
	/**@return{moment.Moment}*/get expireTime() {return this._expireTime;}
	/**@return{number}*/get deliveryCount() {return this._deliveryCount;}
	/**@return{MessageAuthorization}*/get authorization() {return this._authorization;}
	/**@returns {Promise<boolean>}*/async isExpired() {
		let _now = moment();

	}
	// /**
	//  * @param {Header} header
	//  * @returns {Promise<{authorization: Object, $object: {schema: string}, expireTime: moment.Moment, createTime:
	//  *     moment.Moment, subject: (string|null), action: (string|null), correlationId: string, id: string, source:
	//  *     (string|null), type: (string|null), deliveryCount: number}>}
	//  */
	// static async marshal(header) {
	// 	let _authorization = null;
	//
	// 	let _createTime = header._createTime;
	// 	if(_createTime != null) _createTime = header._createTime.parse();
	// 	let _expireTime = header._expireTime;
	// 	if(_expireTime != null) _expireTime = header._expireTime.parse();
	//
	// 	return {
	// 		$object: {schema: Header.$object.schema},
	// 		id: header._id,
	// 		correlationId: header._correlationId,
	// 		type: header._type,
	// 		source: header._source,
	// 		subject: header._subject,
	// 		action: header._action,
	// 		createTime: _createTime,
	// 		expireTime: _expireTime,
	// 		deliveryCount: header._deliveryCount,
	// 		authorization: _authorization
	// 	}
	// }
	//
	// /**
	//  * @param {Object} _Header
	//  * @param {string} messageId
	//  * @param {number} deliveryCount
	//  * @param {Date} enqueuedTimeUtc
	//  * @returns {Promise<Header>}
	//  */
	// static async unmarshal(_Header, messageId, deliveryCount, enqueuedTimeUtc) {
	// 	if(!_Header.hasOwnProperty("id") || typeof _Header.id !== "string" || _Header.id.trim().length === 0)
	// 		throw CelastrinaValidationError.newValidationError("Attribute 'id' is required.", "header.id");
	// 	if(!_Header.hasOwnProperty("correlationId") || typeof _Header.correlationId !== "string" || _Header.correlationId.trim().length === 0)
	// 		throw CelastrinaValidationError.newValidationError("Attribute 'correlationId' is required.", "header.correlationId");
	// 	if(!_Header.hasOwnProperty("type") || typeof _Header.type !== "string" || _Header.type !== Header.MESSAGE_TYPE )
	// 		throw CelastrinaValidationError.newValidationError("Attribute 'type' is invalid.", "header.type");
	// 	if(!_Header.hasOwnProperty("version") || typeof _Header.version !== "string" || _Header.version !== Header.MESSAGE_TYPE )
	// 		throw CelastrinaValidationError.newValidationError("Attribute 'version' is invalid.", "header.version");
	// 	if(!_Header.hasOwnProperty("subject") || typeof _Header.subject !== "string" || _Header.subject.trim().length === 0)
	// 		throw CelastrinaValidationError.newValidationError("Attribute 'subject' is required.", "header.subject");
	// 	if(!_Header.hasOwnProperty("action") || typeof _Header.action !== "string" || _Header.action.trim().length === 0)
	// 		throw CelastrinaValidationError.newValidationError("Attribute 'action' is required.", "header.action");
	//
	// 	let _createTime = null
	// 	if(_Header.hasOwnProperty("createTime") && typeof _Header.createTime === "string" &&
	// 			_Header.createTime.trim().length > 0)
	// 		_createTime = moment(_Header.createTime);
	// 	let _expireTime = null
	// 	if(_Header.hasOwnProperty("expireTime") && typeof _Header.expireTime === "string" &&
	// 		_Header.expireTime.trim().length > 0)
	// 		_createTime = moment(_Header.expireTime);
	//
	// 	let _authorization = null;
	//
	// 	return new Header(messageId, _Header.correlationId, _Header.type, _Header.version, _Header.source,
	// 		             _Header.subject, _Header.action, moment(enqueuedTimeUtc), _createTime, _expireTime,
	// 		             deliveryCount, _authorization);
	// }
}

/**
 * Message
 * @author Robert R Murrell
 */
class Message {
	static get $object() {return {schema: "https://celastrinajs/schema/v1.0.0/message/Message#",
		                          type: "celastrinajs.message.Message"};}
	static DEFAULT_PAYLOAD_CONTENT_TYPE = "application/json;charset=utf-8";
	/**
	 * @param {Header} [header=new Header()]
	 * @param {*} [payload=null]
	 * @param {string} [payloadContentType="application/json;charset=utf-8"]
	 */
	constructor(header = new Header(), payload = null, payloadContentType = Message.DEFAULT_PAYLOAD_CONTENT_TYPE) {
		this._header = header;
		this._payload = payload;
		this._payloadContentType = payloadContentType;
	}
	/**@returns{Header}*/get header() {return this._header;}
	/**@param{Header}header*/set header(header) {this._header = header;}
	/**@returns{*}*/get payload() {return this._payload;}
	/**@param{*}payload*/set payload(payload) {this._payload = payload;}
	/**@returns{string}*/get payloadContentType() {return this._payloadContentType;}
	/**@param{string}payloadContentType*/set payloadContentType(payloadContentType) {this._payloadContentType = payloadContentType;}
	// /**
	//  * @param {Message} message
	//  * @returns {Promise<{payload: *, payloadContentType: string, header: {authorization: Object, $object: {schema:
	//  *     string}, expireTime: moment.Moment, createTime: moment.Moment, subject: (string|null), action:
	//  *     (string|null), correlationId: string, id: string, source: (string|null), type: (string|null), deliveryCount:
	//  *     number}}>}
	//  */
	// static async marshal(message) {
	// 	let _header = await Header.marshal(message.header);
	// 	return {
	// 		header: _header,
	// 		payload: message._payload,
	// 		payloadContentType: message._payloadContentType
	// 	}
	// }
	// /**
	//  * @param {Object|string|null} _Message
	//  * @param {string} messageId
	//  * @param {number} deliveryCount
	//  * @param {Date} enqueuedTimeUtc
	//  * @returns {Promise<Message>}
	//  */
	// static async unmarshal(_Message, messageId, deliveryCount, enqueuedTimeUtc) {
	// 	let _message = _Message;
	// 	if(typeof _Message === "string") _message = JSON.parse(_Message);
	// 	if(!_message.hasOwnProperty("header") || typeof _message.header !== "object")
	// 		throw CelastrinaValidationError.newValidationError(
	// 			"Attribute 'header' is required. Are you sure this is a celastrina message?", "message.header");
	// 	if(!_message.header.hasOwnProperty("$object") || typeof _message.header.$object !== "object")
	// 		throw CelastrinaValidationError.newValidationError(
	// 			"Invalid meta-data. Are you sure this is a celastrina message?", "message.header.$object");
	// 	if(!_message.header.$object.hasOwnProperty("schema") || typeof _message.header.$object.schema !== "string" ||
	// 		_message.header.$object.schema.trim() !== Message.$object.schema)
	// 		throw CelastrinaValidationError.newValidationError(
	// 			"Invalid meta-data, expected schema '" + Message.$object.schema + "'. Are you sure this is a celastrina message?",
	// 			    "message.header.$object.schema");
	//
	// 	let _header = await Header.unmarshal(_message.header, messageId, deliveryCount, enqueuedTimeUtc);
	// 	let _payload = _message.payload;
	// 	let _contentType = _message.payloadContentType;
	//
	// 	return new Message(_header, _payload, _contentType);
	// }
}


/**
 * JSONCelastrinaMessageMarshaller
 * @author Robert R Murrell
 */
class JSONCelastrinaMessageMarshaller extends Marshaller {
	constructor() {
		super("application/vnd.celastrinajs.message+json");
	}
	async unmarshal(value) {
		return super.unmarshal(value);
	}
	async marshal(value) {
		return super.marshal(value);
	}
}
/**
 * CelastrinaMessageContext
 * @author Robert R Murrell
 */
class CelastrinaMessageContext extends BaseMessageContext {
	/**@returns{Object}*/static get $object() {return {schema: "https://celastrinajs/schema/v1.0.0/message/CelastrinaMessageContext#",
		                                               type: "celastrinajs.message.CelastrinaMessageContext"};}
	constructor(config) {
		super(config);
		/**@type{Message}*/this._message = null;
	}
	/**@returns{Message}*/get message() {return this._message;}
	/**@param{Message}message*/set message(message) {this._message = message;}
}
/**
 * CelastrinaMessageFunction
 * @author Robert R Murrell
 */
class CelastrinaMessageFunction extends BaseMessageFunction {
	/**@returns{Object}*/static get $object() {return {schema: "https://celastrinajs/schema/v1.0.0/message/CelastrinaMessageFunction#",
		                                               type: "celastrinajs.message.CelastrinaMessageFunction"};}
	static MESSAGE_BINDING_PROPERTY = "message";
	constructor(config) {super(config);}
	async createContext(config) {return new CelastrinaMessageContext(config);}
	/**
	 * @param {BaseMessageContext|CelastrinaMessageContext} context
	 * @return {Promise<void>}
	 */
	async handleProcessLifeCycle(context) {
		return this.onMessage(context);
	}
	/**
	 * @param {CelastrinaMessageContext} context
	 * @returns {Promise<void>}
	 */
	async onMessage(context) {}
}
/**
 * CelastrinaMessageAddOn
 * @author Robert R Murrell
 */
class CelastrinaMessageAddOn extends AddOn {
	/**@returns{Object}*/static get $object() {return {schema: "https://celastrinajs/schema/v1.0.0/message/CelastrinaMessageAddOn#",
		                                               type: "celastrinajs.message.CelastrinaMessageAddOn",
		                                               addOn: "celastrinajs.addon.msg.celastrinamessage"};}
	constructor() {
		super([], [LifeCycle.STATE.INITIALIZE]);
		this._sourceFilter = null;
		this._subjectFilter = null;
		this._actionFilter = null;
		this._rejectOnExpired = true;
		this.abortOnReject = true;
	}
}

module.exports = {
	CloudEventContext: CloudEventContext,
	CloudEventFunction: CloudEventFunction,
	CloudEventAddOn: CloudEventAddOn,
	CelastrinaMessageContext: CelastrinaMessageContext,
	CelastrinaMessageFunction: CelastrinaMessageFunction,
	CelastrinaMessageAddOn: CelastrinaMessageAddOn
};
