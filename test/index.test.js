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

/* eslint-env mocha */
/* eslint mocha/no-mocha-arrows: "off" */

'use strict';

const nock = require('nock');
const assert = require('assert');
const fetch = require('../index');
const rewire = require('rewire');

// for tests requiring socket control
const http = require('http');
const getPort = require('get-port');

const FAKE_BASE_URL = 'https://fakeurl.com';
const FAKE_PATH = '/image/test.png';

class Timer {
    constructor() {
        this.start = Date.now();
    }

    get ellapsed() {
        return Date.now() - this.start;
    }

    isBetween(v1, v2) {
        const answer = (this.ellapsed >= v1 && this.ellapsed <= v2);
        return answer;
    }
}

describe('test `retryInit` function', () => {
    afterEach(() => {
        delete process.env.__OW_ACTION_DEADLINE;
        delete process.env.NODE_FETCH_RETRY_MAX_RETRY;
        delete process.env.NODE_FETCH_RETRY_BACKOFF;
        delete process.env.NODE_FETCH_RETRY_SOCKET_TIMEOUT;
        delete process.env.NODE_FETCH_RETRY_INITIAL_WAIT;
        delete process.env.NODE_FETCH_RETRY_FORCE_TIMEOUT;
    });
    it('no params, use default values', () => {
        const rewiredFetchRetry = rewire('../index');
        const retryInit = rewiredFetchRetry.__get__('retryInit');
        const retryOptions = retryInit();
        console.log('retryOptions: ', retryOptions);
        assert.strictEqual(typeof retryOptions.startTime, 'number');
        assert.strictEqual(retryOptions.retryMaxDuration, 60000);
        assert.strictEqual(retryOptions.retryInitialDelay, 100);
        assert.strictEqual(retryOptions.retryBackoff, 2);
        assert.strictEqual(typeof retryOptions.retryOnHttpResponse, 'function');
        assert.strictEqual(retryOptions.retryOnHttpResponse({ status: 500 }), true);
        assert.strictEqual(retryOptions.retryOnHttpResponse({ status: 400 }), false);
        assert.strictEqual(retryOptions.socketTimeout, 30000);
    });

    it('no params, environment variables set, override default values', () => {
        const rewiredFetchRetry = rewire('../index');
        const retryInit = rewiredFetchRetry.__get__('retryInit');
        // override default values
        process.env.NODE_FETCH_RETRY_MAX_RETRY = 70000;
        process.env.NODE_FETCH_RETRY_INITIAL_WAIT = 500;
        process.env.NODE_FETCH_RETRY_BACKOFF = 1.0;
        process.env.NODE_FETCH_RETRY_SOCKET_TIMEOUT = 1000;
        const retryOptions = retryInit();
        assert.strictEqual(typeof retryOptions.startTime, 'number');
        assert.strictEqual(retryOptions.retryMaxDuration, 70000);
        assert.strictEqual(retryOptions.retryInitialDelay, 500);
        assert.strictEqual(retryOptions.retryBackoff, 1);
        assert.strictEqual(typeof retryOptions.retryOnHttpResponse, 'function');
        assert.strictEqual(retryOptions.retryOnHttpResponse({ status: 500 }), true);
        assert.strictEqual(retryOptions.retryOnHttpResponse({ status: 400 }), false);
        assert.strictEqual(retryOptions.socketTimeout, 1000);
    });

    it('pass in custom parameters', () => {
        const rewiredFetchRetry = rewire('../index');
        const retryInit = rewiredFetchRetry.__get__('retryInit');
        const retryOptions = retryInit({
            retryOptions: {
                retryMaxDuration: 3000,
                retryInitialDelay: 200,
                retryBackoff: 3.0,
                retryOnHttpResponse: () => {
                    return false;
                },
                socketTimeout: 2000
            }
        });
        assert.strictEqual(typeof retryOptions.startTime, 'number');
        assert.strictEqual(retryOptions.retryMaxDuration, 3000);
        assert.strictEqual(retryOptions.retryInitialDelay, 200);
        assert.strictEqual(retryOptions.retryBackoff, 3);
        assert.strictEqual(typeof retryOptions.retryOnHttpResponse, 'function');
        assert.strictEqual(retryOptions.retryOnHttpResponse({ status: 500 }), false);
        assert.strictEqual(retryOptions.retryOnHttpResponse({ status: 400 }), false);
        assert.strictEqual(retryOptions.socketTimeout, 2000);
    });

    it('pass in custom parameters and set enviroment variables, passed parameters take priority', () => {
        const rewiredFetchRetry = rewire('../index');
        const retryInit = rewiredFetchRetry.__get__('retryInit');
        // environment variables do not make a difference
        process.env.NODE_FETCH_RETRY_MAX_RETRY = 70000;
        process.env.NODE_FETCH_RETRY_INITIAL_WAIT = 500;
        process.env.NODE_FETCH_RETRY_BACKOFF = 1.0;
        process.env.NODE_FETCH_RETRY_SOCKET_TIMEOUT = 1000;
        const retryOptions = retryInit({
            retryOptions: {
                retryMaxDuration: 3000,
                retryInitialDelay: 200,
                retryBackoff: 3.0,
                retryOnHttpResponse: () => {
                    return false;
                },
                socketTimeout: 2000
            }
        });
        assert.strictEqual(typeof retryOptions.startTime, 'number');
        assert.strictEqual(retryOptions.retryMaxDuration, 3000);
        assert.strictEqual(retryOptions.retryInitialDelay, 200);
        assert.strictEqual(retryOptions.retryBackoff, 3);
        assert.strictEqual(typeof retryOptions.retryOnHttpResponse, 'function');
        assert.strictEqual(retryOptions.retryOnHttpResponse({ status: 500 }), false);
        assert.strictEqual(retryOptions.retryOnHttpResponse({ status: 400 }), false);
        assert.strictEqual(retryOptions.socketTimeout, 2000);
    });

    it('socket timeout is larger than retry max duration', () => {
        const rewiredFetchRetry = rewire('../index');
        const retryInit = rewiredFetchRetry.__get__('retryInit');
        const retryOptions = retryInit({
            retryOptions: {
                retryMaxDuration: 3000,
                socketTimeout: 4000
            }
        });
        assert.strictEqual(typeof retryOptions.startTime, 'number');
        assert.strictEqual(retryOptions.retryMaxDuration, 3000);
        assert.strictEqual(retryOptions.retryInitialDelay, 100);
        assert.strictEqual(retryOptions.retryBackoff, 2);
        assert.strictEqual(typeof retryOptions.retryOnHttpResponse, 'function');
        assert.strictEqual(retryOptions.retryOnHttpResponse({ status: 500 }), true);
        assert.strictEqual(retryOptions.retryOnHttpResponse({ status: 400 }), false);
        assert.strictEqual(retryOptions.socketTimeout, 1500); // gets set to half the retryMaxDuration
    });
    it('socket timeout is larger than retry max duration but `forceSocketTimeout` is true', () => {
        const rewiredFetchRetry = rewire('../index');
        const retryInit = rewiredFetchRetry.__get__('retryInit');
        const retryOptions = retryInit({
            retryOptions: {
                retryMaxDuration: 3000,
                socketTimeout: 4000,
                forceSocketTimeout: true
            }
        });
        assert.strictEqual(typeof retryOptions.startTime, 'number');
        assert.strictEqual(retryOptions.retryMaxDuration, 3000);
        assert.strictEqual(retryOptions.retryInitialDelay, 100);
        assert.strictEqual(retryOptions.retryBackoff, 2);
        assert.strictEqual(typeof retryOptions.retryOnHttpResponse, 'function');
        assert.strictEqual(retryOptions.retryOnHttpResponse({ status: 500 }), true);
        assert.strictEqual(retryOptions.retryOnHttpResponse({ status: 400 }), false);
        assert.strictEqual(retryOptions.socketTimeout, 4000); // gets set to half the retryMaxDuration
    });

    it('retry max duration is greater than time till action timeout', () => {
        const rewiredFetchRetry = rewire('../index');
        const retryInit = rewiredFetchRetry.__get__('retryInit');
        process.env.__OW_ACTION_DEADLINE = Date.now() + 1000;
        const retryOptions = retryInit({
            retryOptions: {
                retryMaxDuration: 3000
            }
        });
        assert.strictEqual(typeof retryOptions.startTime, 'number');
        assert.ok(retryOptions.retryMaxDuration < 3000, retryOptions.retryMaxDuration > 0);
        assert.strictEqual(retryOptions.retryInitialDelay, 100);
        assert.strictEqual(retryOptions.retryBackoff, 2);
        assert.strictEqual(typeof retryOptions.retryOnHttpResponse, 'function');
        assert.strictEqual(retryOptions.retryOnHttpResponse({ status: 500 }), true);
        assert.strictEqual(retryOptions.retryOnHttpResponse({ status: 400 }), false);
    });
});

describe('test fetch retry', () => {
    afterEach(() => {
        assert(nock.isDone);
        nock.cleanAll();
    });

    it('test fetch get works 200', async () => {
        nock(FAKE_BASE_URL)
            .get(FAKE_PATH)
            .reply(200, { ok: true });
        const response = await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`, { method: 'GET' });
        assert.strictEqual(response.ok, true);
    });

    it('test fetch get works 200 with custom headers (basic auth)', async () => {
        nock(FAKE_BASE_URL)
            .get(FAKE_PATH)
            .matchHeader('Authorization', 'Basic thisShouldBeAnAuthHeader')
            .reply(200, { ok: true });

        const response = await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`,
            { 
                method: 'GET', 
                headers: { Authorization: 'Basic thisShouldBeAnAuthHeader' } 
            }
        );
        assert.strictEqual(response.ok, true);
    });

    it('test fetch get works 200 with custom headers (bearer token)', async () => {
        nock(FAKE_BASE_URL)
            .get(FAKE_PATH)
            .matchHeader('Authorization', 'Bearer thisShouldBeAToken')
            .reply(200, { ok: true });

        const response = await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`,
            { 
                method: 'GET', 
                headers: { Authorization: 'Bearer thisShouldBeAToken' } 
            }
        );
        assert.strictEqual(response.ok, true);
    });

    it('test fetch get works 202', async () => {
        nock(FAKE_BASE_URL)
            .get(FAKE_PATH)
            .reply(202, { ok: true });
        const response = await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`, { method: 'GET' });
        assert.strictEqual(response.ok, true);
    });

    it('test fetch put works 200', async () => {
        nock(FAKE_BASE_URL)
            .put(FAKE_PATH, 'hello')
            .reply(200, { ok: true });
        const response = await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`, { method: 'PUT', body: 'hello' });
        assert.strictEqual(response.ok, true);
    });

    it('test fetch put works 202', async () => {
        nock(FAKE_BASE_URL)
            .put(FAKE_PATH, 'hello')
            .reply(202, { ok: true });
        const response = await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`, { method: 'PUT', body: 'hello' });
        assert.strictEqual(response.ok, true);
    });

    it('test fetch stops on 401 with custom headers (basic auth)', async () => {
        nock(FAKE_BASE_URL)
            .get(FAKE_PATH)
            .matchHeader('Authorization', 'Basic thisShouldBeAnAuthHeader')
            .reply(401, { ok: false });

        const response = await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`,
            { 
                method: 'GET', 
                headers: { Authorization: 'Basic thisShouldBeAnAuthHeader' } 
            }
        );
        assert.strictEqual(response.ok, false);
    });

    it('test disable retry', async () => {
        nock(FAKE_BASE_URL)
            .get(FAKE_PATH)
            .reply(500);
        const response = await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`, { method: 'GET', retryOptions: false });
        assert.strictEqual(response.statusText, 'Internal Server Error');
    });

    it('test get retry with default settings 500 then 200', async () => {
        nock(FAKE_BASE_URL)
            .get(FAKE_PATH)
            .twice()
            .reply(500);
        nock(FAKE_BASE_URL)
            .get(FAKE_PATH)
            .reply(200, { ok: true });
        const response = await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`, { method: 'GET' });
        assert(nock.isDone());
        assert(response.ok);
        assert.strictEqual(response.statusText, 'OK');
        assert.strictEqual(response.status, 200);
    });

    it('test get retry with default settings 500 then 200 with auth headers set', async () => {
        nock(FAKE_BASE_URL)
            .get(FAKE_PATH)
            .matchHeader('Authorization', 'Basic thisShouldBeAnAuthHeader')
            .twice()
            .reply(500);
        nock(FAKE_BASE_URL)
            .get(FAKE_PATH)
            .matchHeader('Authorization', 'Basic thisShouldBeAnAuthHeader')
            .reply(200, { ok: true });
        const response = await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`, 
            { 
                method: 'GET', headers: { Authorization: 'Basic thisShouldBeAnAuthHeader' }  
            });
        assert(nock.isDone());
        assert(response.ok);
        assert.strictEqual(response.statusText, 'OK');
        assert.strictEqual(response.status, 200);
    });

    it('test retry with default settings 400', async () => {
        nock(FAKE_BASE_URL)
            .get(FAKE_PATH)
            .reply(400);
        const response = await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`, { method: 'GET' });
        assert(nock.isDone());
        assert(!response.ok);
        assert.strictEqual(response.statusText, 'Bad Request');
        assert.strictEqual(response.status, 400);
    });

    it('test retry with default settings 404', async () => {
        nock(FAKE_BASE_URL)
            .get(FAKE_PATH)
            .reply(404);
        const response = await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`, { method: 'GET' });
        assert(nock.isDone());
        assert(!response.ok);
        assert.strictEqual(response.statusText, 'Not Found');
        assert.strictEqual(response.status, 404);
    });

    it('test retry with default settings 300', async () => {
        nock(FAKE_BASE_URL)
            .get(FAKE_PATH)
            .reply(300);
        const response = await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`, { method: 'GET' });
        assert(nock.isDone());
        assert(!response.ok);
        assert.strictEqual(response.statusText, 'Multiple Choices');
        assert.strictEqual(response.status, 300);
    });

    it('test retry with default settings error 3 times 503', async () => {
        nock(FAKE_BASE_URL)
            .get(FAKE_PATH)
            .thrice()
            .replyWithError({
                message: 'something awful happened',
                code: '503',
            });
        nock(FAKE_BASE_URL)
            .get(FAKE_PATH)
            .reply(200, { ok: true });
        const response = await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`, { method: 'GET' });
        assert(nock.isDone());
        assert.strictEqual(response.statusText, 'OK');
        assert.strictEqual(response.status, 200);
    }).timeout(3000);

    it('test retry timeout on error 503', async () => {
        nock(FAKE_BASE_URL)
            .get(FAKE_PATH)
            .thrice()
            .replyWithError({
                message: 'something awful happened',
                code: '503',
            });
        const timer = new Timer();
        try {
            await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`, { method: 'GET', retryOptions: { retryMaxDuration: 700 } });
            assert.fail("Should have thrown an error!");
        } catch (e) {
            assert(nock.isDone());
            assert.strictEqual(e.message, 'request to https://fakeurl.com/image/test.png failed, reason: something awful happened');
            assert.strictEqual(e.code, '503');
        }
        console.log(`ellapsed: ${timer.ellapsed}`);
        assert.ok(timer.isBetween(300, 500), "Should have taken approximately 400ms");
    });

    it('test retry timeout on 404 response', async () => {
        nock(FAKE_BASE_URL)
            .get(FAKE_PATH)
            .thrice()
            .reply(404);

        const response = await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`, {
            method: 'GET',
            retryOptions: {
                retryMaxDuration: 800,
                retryOnHttpResponse: (res) => { return !res.ok; }
            }
        });
        assert(nock.isDone());
        assert.strictEqual(response.statusText, 'Not Found');
        assert.strictEqual(response.status, 404);
    });

    it('test retry with retryInitialDelay > retryMaxDuration, (no retry)', async () => {
        nock(FAKE_BASE_URL)
            .get(FAKE_PATH)
            .twice()
            .reply(505);
        const timer = new Timer();
        const response = await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`,
            {
                method: 'GET', retryOptions: {
                    retryInitialDelay: 5000,
                    retryMaxDuration: 1000
                }
            });
        assert.ok(timer.isBetween(0, 100), "Should have taken < 100ms");
        assert(!nock.isDone()); // should fail on first fetch call
        nock.cleanAll();
        assert.strictEqual(response.statusText, 'HTTP Version Not Supported');
        assert.strictEqual(response.status, 505);
    });

    it('test retry with custom settings', async () => {
        nock(FAKE_BASE_URL)
            .get(FAKE_PATH)
            .twice()
            .reply(403);
        nock(FAKE_BASE_URL)
            .get(FAKE_PATH)
            .reply(200);
        const response = await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`,
            {
                method: 'GET', retryOptions: {
                    retryInitialDelay: 200,
                    retryMaxDuration: 1000,
                    retryOnHttpResponse: (response) => {
                        return !response.ok;
                    }
                }
            });
        assert(nock.isDone());
        assert.strictEqual(response.statusText, 'OK');
        assert.strictEqual(response.status, 200);
    });

    it('do not retry on some HTTP codes', async () => {
        nock(FAKE_BASE_URL)
            .get(FAKE_PATH)
            .twice()
            .reply(401);
        nock(FAKE_BASE_URL)
            .get(FAKE_PATH)
            .reply(200);
        const response = await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`,
            {
                method: 'GET', retryOptions: {
                    retryInitialDelay: 200,
                    retryMaxDuration: 1000,
                    retryOnHttpResponse: (response) => {
                        return response.status !== 401;
                    }
                }
            });
        assert(!nock.isDone()); // nock should not have gotten all calls
        assert.strictEqual(response.statusText, 'Unauthorized');
        assert.strictEqual(response.status, 401);

        // clean up nock
        nock.cleanAll();
    });

    it('do not retry on some HTTP codes and custom headers', async () => {
        nock(FAKE_BASE_URL)
            .get(FAKE_PATH)
            .matchHeader('Authorization', 'Basic thisShouldBeAnAuthHeader')
            .twice()
            .reply(401);
        nock(FAKE_BASE_URL)
            .get(FAKE_PATH)
            .reply(200);
        const response = await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`,
            {
                method: 'GET', 
                headers: {
                    Authorization: 'Basic thisShouldBeAnAuthHeader'
                },
                retryOptions: {
                    retryInitialDelay: 200,
                    retryMaxDuration: 1000,
                    retryOnHttpResponse: (response) => {
                        return response.status !== 401;
                    }
                }
            });
        assert(!nock.isDone()); // nock should not have gotten all calls
        assert.strictEqual(response.statusText, 'Unauthorized');
        assert.strictEqual(response.status, 401);

        // clean up nock
        nock.cleanAll();
    });

    it('test retry with small interval', async () => {
        nock(FAKE_BASE_URL)
            .persist()
            .get(FAKE_PATH)
            .reply(404);
        const response = await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`,
            {
                method: 'GET', retryOptions: {
                    retryInitialDelay: 10,
                    retryMaxDuration: 2500,
                    retryAllErrors: true
                }
            });
        assert(nock.isDone());
        nock.cleanAll(); // clean persisted nock
        assert.strictEqual(response.statusText, 'Not Found');
        assert.strictEqual(response.status, 404);

    }).timeout(3000);

    it('test retry with malformed settings', async () => {
        let threw = false;
        try {
            await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`, { method: 'GET', retryOptions: { retryMaxDuration: 'hello' } });
        } catch (e) {
            assert.strictEqual(e.message, "`retryMaxDuration` must not be a negative integer");
            threw = true;
        }
        assert.ok(threw);

        threw = false;
        try {
            await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`, { method: 'GET', retryOptions: { retryInitialDelay: -123425 } });
        } catch (e) {
            assert.strictEqual(e.message, "`retryInitialDelay` must not be a negative integer");
            threw = true;
        }
        assert.ok(threw);

        threw = false;
        try {
            await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`, { method: 'GET', retryOptions: { retryOnHttpResponse: 123425 } });
        } catch (e) {
            assert.strictEqual(e.message, "'retryOnHttpResponse' must be a function: 123425");
            threw = true;
        }
        assert.ok(threw);

        threw = false;
        try {
            await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`, { method: 'GET', retryOptions: { retryBackoff: 0 } });
            // retryBackoff must be greater than zero
        } catch (e) {
            assert.strictEqual(e.message, "`retryBackoff` must be a positive integer >= 1");
            threw = true;
        }
        assert.ok(threw);

        threw = false;
        try {
            await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`, { method: 'GET', retryOptions: { retryBackoff: '21rgvfdb;wt' } });
        } catch (e) {
            assert.strictEqual(e.message, "`retryBackoff` must be a positive integer >= 1");
            threw = true;
        }
        assert.ok(threw);

        threw = false;
        try {
            await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`, { method: 'GET', retryOptions: { socketTimeout: '21rgvfdb;wt' } });
        } catch (e) {
            assert.strictEqual(e.message, "`socketTimeout` must not be a negative integer");
            threw = true;
        }
        assert.ok(threw);
    });

    it("verifies handling of socket timeout when socket times out (after first failure)", async () => {
        const socketTimeout = 500;

        console.log("!! Test http server ----------");
        // The test needs to be able to control the server socket
        // (which nock or whatever-http-mock can't).
        // So here we are, creating a dummy very simple http server.

        const hostname = "127.0.0.1";
        const port = await getPort({ port: 8000 });

        const waiting = socketTimeout * 10; // time to wait for requests > 0
        let requestCounter = 0;
        const server = http.createServer((req, res) => {
            if (requestCounter === 0) { // let first request fail
                requestCounter++;
                res.statusCode = 500;
                res.setHeader('Content-Type', 'text/plain');
                res.end('Fail \n');
            } else {
                setTimeout(function () {
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'text/plain');
                    res.end('Worked! \n');
                }, waiting);
            }
        });

        server.listen(port, hostname, () => {
            console.log(`Dummy HTTP Test server running at http://${hostname}:${port}/`);
        });

        const retry = {
            retryMaxDuration: 300,
            socketTimeout: socketTimeout,
            forceSocketTimeout: true
        };
        try {
            await fetch(`http://${hostname}:${port}`, { method: 'GET', retryOptions: retry });
            assert.fail("Should have timed out!");
        } catch (e) {
            console.log(e);
            assert(e.message.includes("network timeout"));
            assert(e.type === "request-timeout");
        } finally {
            server.close();
        }
    });

    it("verifies handling of socket timeout when socket times out - use retryMax as timeout value (after first failure)", async () => {
        const socketTimeout = 50000;

        console.log("!! Test http server ----------");
        // The test needs to be able to control the server socket
        // (which nock or whatever-http-mock can't).
        // So here we are, creating a dummy very simple http server.

        const hostname = "127.0.0.1";
        const port = await getPort({ port: 8000 });

        const waiting = 600; // time to wait for requests > 0
        let requestCounter = 0;
        const server = http.createServer((req, res) => {
            if (requestCounter === 0) { // let first request fail
                requestCounter++;
                res.statusCode = 500;
                res.setHeader('Content-Type', 'text/plain');
                res.end('Fail \n');
            } else {
                setTimeout(function () {
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'text/plain');
                    res.end('Worked! \n');
                }, waiting);
            }
        });

        server.listen(port, hostname, () => {
            console.log(`Dummy HTTP Test server running at http://${hostname}:${port}/`);
        });

        const retry = {
            retryMaxDuration: waiting,
            socketTimeout: socketTimeout,
            forceSocketTimeout: false,
            retryOnHttpResponse: function (response) {
                if (response.status === 500 && response.statusText === "Internal Server Error") {
                    // retry on first failed attempt: 500 with Internal Server Error
                    return true;
                }
            }
        };
        try {
            await fetch(`http://${hostname}:${port}`, { method: 'GET', retryOptions: retry });
            assert.fail("Should have timed out!");
        } catch (e) {
            console.log(e);
            assert(e.message.includes("network timeout"));
            assert(e.type === "request-timeout");
        } finally {
            server.close();
        }
    });

    it("verifies handling of socket timeout when socket does not time out (works after initial failure)", async () => {
        const socketTimeout = 5000;

        console.log("!! Test http server ----------");
        // The test needs to be able to control the server socket
        // (which nock or whatever-http-mock can't).
        // So here we are, creating a dummy very simple http server.

        const hostname = "127.0.0.1";
        const port = await getPort({ port: 8000 });

        const waiting = socketTimeout / 5; // time to wait for requests > 0
        let requestCounter = 0;
        const server = http.createServer((req, res) => {
            if (requestCounter === 0) { // let first request fail
                requestCounter++;
                res.statusCode = 500;
                res.setHeader('Content-Type', 'text/plain');
                res.end('Fail \n');
            } else {
                setTimeout(function () { // let second request pass
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'text/plain');
                    res.end('Worked! \n');
                }, waiting);
            }
        });

        server.listen(port, hostname, () => {
            console.log(`Dummy HTTP Test server running at http://${hostname}:${port}/`);
        });

        const retry = {
            retryMaxDuration: 10000,
            socketTimeout: socketTimeout,
            forceSocketTimeout: true,
            retryOnHttpResponse: function (response) {
                if (response.status === 500 && response.statusText === "Internal Server Error") {
                    // retry on first failed attempt: 500 with Internal Server Error
                    return true;
                }
            }
        };

        const result = await fetch(`http://${hostname}:${port}`, { method: 'GET', retryOptions: retry });
        assert.ok(result.status === 200);
        console.error(`result timeout ${result.timeout} vs socketTimeout ${socketTimeout}`);
        assert.ok(result.timeout === socketTimeout);

        server.close();
    });

    it("Verifies the parameter options is not required", async () => {
        nock(FAKE_BASE_URL)
            .get(FAKE_PATH)
            .reply(200, { ok: true });
        const response = await fetch(`${FAKE_BASE_URL}${FAKE_PATH}`);
        assert.strictEqual(response.ok, true);
    });
});
