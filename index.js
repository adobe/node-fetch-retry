/*
 * Copyright 2020 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
'use strict';

const AbortController = require('abort-controller');
const fetch = require('node-fetch');
const {FetchError} = fetch;

function getTimeRemaining(retryOptions) {
    if (retryOptions && retryOptions.startTime && retryOptions.retryMaxDuration) {
        const millisEllapsed = Date.now() - retryOptions.startTime;        
        const remaining = retryOptions.retryMaxDuration - millisEllapsed;
        return Math.max(0, remaining);
    } else {
        return Infinity;
    }
}

/**
 * Have we exceeded the max duration for this fetch operation?
 * @param {*} retryOptions Options including retryMaxDuration and startTime
 * @returns True if we have a max duration set and it is exceeded, otherwise false
 */
function isResponseTimedOut(retryOptions) {
    return getTimeRemaining(retryOptions) <= 0;
}

/**
 * shouldRetry
 * @param {RetryOptions} retryOptions whether or not to retry on all http error codes or just >500
 * @param {Object} error error object if the fetch request returned an error
 * @param {Object} response fetch call response
 * @param {Number} wait Amount of time we will wait before retrying next
 * @returns {Promise<Boolean>} whether or not to retry the request
 */
async function shouldRetry(retryOptions, error, response, waitTime) {
    if (getTimeRemaining(retryOptions) < waitTime) {
        return false;
    } else if (retryOptions && retryOptions.retryOnHttpError && error != null) {
        // retryOnHttpError can be sync or async because either the promise or result will be
        // bubbled up to what shouldRetry returns
        return retryOptions.retryOnHttpError(error);
    } else if (retryOptions && retryOptions.retryOnHttpResponse) {
        // retryOnHttpResponse can be sync or async because either the promise or result will be
        // bubbled up to what shouldRetry returns
        return retryOptions.retryOnHttpResponse(response);
    } else {
        return false;
    }
}

/**
 * Retry Init to set up retry options used in `fetch-retry`
 * @param {Options} options object containing fetch options and retry options
 * @returns {RetryOptions|Boolean} object containing specific attributes for retries or `false` if no retries should be performed
 */
function retryInit(options={}) {
    if (options.retryOptions !== false) {
        const retryOptions = options.retryOptions || {};
        checkParameters(retryOptions);

        // default settings (environment variables available to help unit testing)
        const DEFAULT_MAX_RETRY = parseInt(process.env.NODE_FETCH_RETRY_MAX_RETRY) || 60000;
        const DEFAULT_INITIAL_WAIT = parseInt(process.env.NODE_FETCH_RETRY_INITIAL_WAIT) || 100;
        const DEFAULT_BACKOFF = parseInt(process.env.NODE_FETCH_RETRY_BACKOFF) || 2.0;
        const DEFAULT_SOCKET_TIMEOUT = parseInt(process.env.NODE_FETCH_RETRY_SOCKET_TIMEOUT) || 30000;
        const DEFAULT_FORCE_TIMEOUT = process.env.NODE_FETCH_RETRY_FORCE_TIMEOUT || false;

        let retryMaxDuration = retryOptions.retryMaxDuration || DEFAULT_MAX_RETRY;
        // take into account action timeout if running in the context of an OpenWhisk action
        const timeTillActionTimeout = process.env.__OW_ACTION_DEADLINE && ( process.env.__OW_ACTION_DEADLINE - Date.now()); // duration until action timeout
        if (timeTillActionTimeout && (retryMaxDuration > timeTillActionTimeout) ) {
            retryMaxDuration = timeTillActionTimeout;
        }
        let socketTimeoutValue = retryOptions.socketTimeout || DEFAULT_SOCKET_TIMEOUT;
        if (socketTimeoutValue >= retryMaxDuration) {
            socketTimeoutValue = retryMaxDuration * 0.5; // make socket timeout half of retryMaxDuration to force at least one retry
        }
        if ((retryOptions.forceSocketTimeout || (DEFAULT_FORCE_TIMEOUT === 'true') || DEFAULT_FORCE_TIMEOUT === true)) { // for unit test only - test also for boolean type
            // force the use of set timeout, do not ignore if larger than retryMaxDuration
            console.log('Forced to use socket timeout of (ms):', retryOptions.socketTimeout);
            socketTimeoutValue = retryOptions.socketTimeout;
        }

        return {
            startTime: Date.now(),
            retryMaxDuration: retryMaxDuration,
            retryInitialDelay: retryOptions.retryInitialDelay || DEFAULT_INITIAL_WAIT,
            retryBackoff: retryOptions.retryBackoff || DEFAULT_BACKOFF,
            retryOnHttpResponse: ((typeof retryOptions.retryOnHttpResponse === 'function') && retryOptions.retryOnHttpResponse) ||
                ((response) => { return response.status >= 500; }),
            retryOnHttpError: ((typeof retryOptions.retryOnHttpError === 'function') && retryOptions.retryOnHttpError) ||
                ((error) => { return shouldRetryOnHttpError(error); }),
            socketTimeout: socketTimeoutValue
        };
    }
    return false;
}

/**
 * Calculate the retry delay
 *
 * @param {RetryOptions|Boolean} retryOptions Retry options
 * @param {Boolean} [random=true] Add randomness
 */
function getRetryDelay(retryOptions, random = true) {
    return retryOptions.retryInitialDelay +
        (random ? Math.floor(Math.random() * 100) : 99);
}

/**
 * Check parameters
 * @param {RetryOptions} retryOptions
 * @returns an Error if a parameter is malformed or nothing
 */

function checkParameters(retryOptions) {
    if (retryOptions.retryMaxDuration && !(Number.isInteger(retryOptions.retryMaxDuration) && retryOptions.retryMaxDuration >= 0)) {
        throw new Error('`retryMaxDuration` must not be a negative integer');
    }
    if (retryOptions.retryInitialDelay && !(Number.isInteger(retryOptions.retryInitialDelay) && retryOptions.retryInitialDelay >= 0)) {
        throw new Error('`retryInitialDelay` must not be a negative integer');
    }
    if (retryOptions.retryOnHttpResponse && !(typeof retryOptions.retryOnHttpResponse === 'function')) {
        throw new Error(`'retryOnHttpResponse' must be a function: ${retryOptions.retryOnHttpResponse}`);
    }
    if (retryOptions.retryOnHttpError && !(typeof retryOptions.retryOnHttpError === 'function')) {
        throw new Error(`'retryOnHttpError' must be a function: ${retryOptions.retryOnHttpError}`);
    }
    if (typeof retryOptions.retryBackoff !== 'undefined'
        && !(Number.isInteger(retryOptions.retryBackoff) && retryOptions.retryBackoff >= 1.0)) {
        throw new Error('`retryBackoff` must be a positive integer >= 1');
    }
    if (retryOptions.socketTimeout && !(Number.isInteger(retryOptions.socketTimeout) && retryOptions.socketTimeout >= 0)) {
        throw new Error('`socketTimeout` must not be a negative integer');
    }
}

/**
 * Evaluates whether or not to retry based on HTTP error
 * @param {Object} error 
 * @returns Returns true for all FetchError's of type `system`
 */
function shouldRetryOnHttpError(error) {
    // special handling for known fetch errors: https://github.com/node-fetch/node-fetch/blob/main/docs/ERROR-HANDLING.md
    // retry on all errors originating from Node.js core
    // retry on AbortError caused by network timeouts
    if (error.name === 'FetchError' && error.type === 'system') {
        console.error(`FetchError failed with code: ${error.code}; message: ${error.message}`);
        return true;
    } else if (error.name === 'AbortError') {
        console.error(`AbortError failed with type: ${error.type}; message: ${error.message}`);
        return true;
    }
    return false;
}

/**
 * @typedef {Object} RetryOptions options for retry or false if want to disable retry
 * @property {Integer} retryMaxDuration time (in milliseconds) to retry until throwing an error
 * @property {Integer} retryInitialDelay time to wait between retries in milliseconds
 * @property {Function} retryOnHttpResponse a function determining whether to retry on a specific HTTP code
 * @property {Function} retryOnHttpError a function determining whether to retry on a specific HTTP error
 * @property {Integer} retryBackoff backoff factor for wait time between retries (defaults to 2.0)
 * @property {Integer} socketTimeout Optional socket timeout in milliseconds (defaults to 60000ms)
 * @property {Boolean} forceSocketTimeout If true, socket timeout will be forced to use `socketTimeout` property declared (defaults to false)
 */
/**
 * @typedef {Function} retryOnHttpResponse determines whether to do a retry on the response
 * @property {Number} response response from the http fetch call
 * @returns {Boolean} true if want to retry on this response, false if do not want to retry on the response
 */
/**
 * @typedef {Function} retryOnHttpError determines whether to do a retry on the HTTP error response
 * @property {Object} error error thrown during the fetch request
 * @returns {Boolean} true if want to retry on this error, false if do not want to retry on the response
 */
/**
 * @typedef {Object} Options options for fetch-retry
 * @property {Object} RetryOptions options for retry or false if want to disable retry
 * ... other options for fetch call (method, headers, etc...)
 */
/**
 * Fetch retry that wraps around `node-fetch` library
 * @param {String} url request url
 * @param {Options} options options for fetch request (e.g. headers, RetryOptions for retries or `false` if no do not want to perform retries)
 * @returns {Object} json response of calling fetch 
 */
module.exports = async function (url, options) {
    options = options || {};
    const retryOptions = retryInit(options); // set up retry options or set to default settings if not set
    delete options.retryOptions; // remove retry options from options passed to actual fetch
    let attempt = 0;

    return new Promise(function (resolve, reject) {
        const wrappedFetch = async () => {
            while (!isResponseTimedOut(retryOptions)) {
                ++attempt;
                const waitTime = getRetryDelay(retryOptions);

                let timeoutHandler;
                if (!options.signal && retryOptions.socketTimeout) {
                    const controller = new AbortController();
                    timeoutHandler = setTimeout(() => controller.abort(), retryOptions.socketTimeout);
                    options.signal = controller.signal;
                }                
    
                try {
                    const response = await fetch(url, options);

                    if (await shouldRetry(retryOptions, null, response, waitTime)) {
                        console.error(`Retrying in ${waitTime} milliseconds, attempt ${attempt} failed (status ${response.status}): ${response.statusText}`);
                    } else {
                        // response.timeout should reflect the actual timeout
                        response.timeout = retryOptions.socketTimeout;
                        return resolve(response);
                    }
                } catch (error) {
                    if (!(await shouldRetry(retryOptions, error, null, waitTime))) {
                        if (error.name === 'AbortError') {
                            return reject(new FetchError(`network timeout at ${url}`, 'request-timeout'));
                        } else {
                            return reject(error);
                        }
                    }
                    console.error(`Retrying in ${waitTime} milliseconds, attempt ${attempt} error: ${error.name}, ${error.message}`);
                } finally {
                    clearTimeout(timeoutHandler);
                }
                // Fetch loop is about to repeat, delay as needed first.
                if (waitTime > 0) {
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
                retryOptions.retryInitialDelay *= retryOptions.retryBackoff; // update retry interval
            }
            reject(new FetchError(`network timeout at ${url}`, 'request-timeout'));
        };
        wrappedFetch();
    });
};
