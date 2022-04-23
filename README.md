[![Version](https://img.shields.io/npm/v/@adobe/node-fetch-retry.svg)](https://npmjs.org/package/@adobe/node-fetch-retry)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](http://www.apache.org/licenses/LICENSE-2.0)
[![Travis](https://travis-ci.com/adobe/node-fetch-retry.svg?branch=master)](https://travis-ci.com/adobe/node-fetch-retry)

# node-fetch-retry

Node Module for performing retries for HTTP requests.

It is a wrapper around [`node-fetch`](https://github.com/node-fetch/node-fetch) library. It has default retry logic built in as described below, as well as configurable parameters. It also has built-in support for Apache OpenWhisk actions, adjusting the timeout to reflect the action timeout.

## Installation

```bash
npm install @adobe/node-fetch-retry
```

## Usage

This library works the same as the normal [`fetch api`](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API), but with some added features. 

### Default Behavior

Without configuring any parameters, the retry behavior will be as follows:
- retry for 60s
- retry inital delay of 100ms with exponential backoff, configurable as a multiplier defaulting to 2
- retry only on 5xx response
- retry on all FetchError system errors
   - see node-fetch error handling: https://github.com/node-fetch/node-fetch/blob/main/docs/ERROR-HANDLING.md
- socket timeout of 30s
```js
const fetch = require('@adobe/node-fetch-retry');

async main() {
    const response = await fetch(url);
}
```

This example uses only custom headers and will use default retry settings:

```js
const fetch = require('@adobe/node-fetch-retry');

async main() {
    const response = await fetch(url, {
        headers: {
            'custom-header': '<<put custom header value here>>'
        }
    });
}
```

### Optional Custom Parameters

All the retry options are configurable and can be set in `retryOptions` in the `options` object passed to `fetch`.

| Parameter | Format | Description | Environment variable | Default Value |
| --------- | ------ | ----------- | -------------------- | ------------- |
| `retryMaxDuration` | Number | time in milliseconds to retry until throwing an error | `NODE_FETCH_RETRY_MAX_RETRY` | 60000 ms |
| `retryInitialDelay` | Number | time in milliseconds to wait between retries |`NODE_FETCH_RETRY_INITIAL_WAIT` | 100 ms |
| `retryBackoff` | Number | backoff factor for wait time between retries | `NODE_FETCH_RETRY_BACKOFF` | 2.0 |
| `retryOnHttpResponse` | Function | a *function* determining whether to retry given the HTTP response. Can be asynchronous | none | retry on all 5xx errors|
| `retryOnHttpError` | Function | a *function* determining whether to retry given the HTTP error exception thrown. Can be asynchronous | none | retry on all `FetchError`'s of type `system`|
| `socketTimeout` | Number | time until socket timeout in milliseconds. _Note: if `socketTimeout` is >= `retryMaxDuration`, it will automatically adjust the socket timeout to be exactly half of the `retryMaxDuration`. To disable this feature, see `forceSocketTimeout` below_ | `NODE_FETCH_RETRY_SOCKET_TIMEOUT` | 30000 ms |
| `forceSocketTimeout` | Boolean | If true, socket timeout will be forced to use `socketTimeout` property declared regardless of the `retryMaxDuration`. _Note: this feature was designed to help with unit testing and is not intended to be used in practice_ | `NODE_FETCH_RETRY_FORCE_TIMEOUT` | false |

_Note: the environment variables override the default values if the corresponding parameter is not set. These are designed to help with unit testing. Passed in parameters will still override the environment variables_

### Custom Parameter Examples

This example decreases the `retryMaxDuration` and makes the retry delay a static 500ms. This will do no more than 4 retries.
```js
const fetch = require('@adobe/node-fetch-retry');

async main() {
    const response = await fetch(url, {
        retryOptions: {
            retryMaxDuration: 2000,  // 30s retry max duration
            retryInitialDelay: 500,
            retryBackoff: 1.0 // no backoff
        }
    });
}
```

This example shows how to configure retries on specific HTTP responses:

```js
const fetch = require('@adobe/node-fetch-retry');

async main() {
    const response = await fetch(url, {
        retryOptions: {
            retryOnHttpResponse: function (response) {
                if ( (response.status >= 500) || response.status >= 400) { // retry on all 5xx and all 4xx errors
                    return true;
                }
            }
        }
    });
}
```

This example uses custom `socketTimeout` values:

```js
const fetch = require('@adobe/node-fetch-retry');

async main() {
    const response = await fetch(url, {
        retryOptions: {
            retryMaxDuration: 300000, // 5min retry duration
            socketTimeout: 60000, //  60s socket timeout
        }
    });
}
```

This example uses custom `socketTimeout` values and custom headers:

```js
const fetch = require('@adobe/node-fetch-retry');

async main() {
    const response = await fetch(url, {
        retryOptions: {
            retryMaxDuration: 300000, // 5min retry duration
            socketTimeout: 60000, //  60s socket timeout
        },
        headers: {
            'custom-header': '<<put custom header value here>>'
        }
    });
}
```
This example shows how to retry on all HTTP errors thrown as an exception:
```js
const fetch = require('@adobe/node-fetch-retry');

async main() {
    const response = await fetch(url, {
        retryOptions: {
            retryOnHttpError: function (error) {
                return true;
            }
        }
    });
}
```


### Disable Retry

You can disable all retry behavior by setting `retryOptions` to `false`.

```js
const fetch = require('@adobe/node-fetch-retry');

async main() {
    const response = await fetch(url, {
        retryOptions: false
    });
}
```

Disabling retry behavior will not prevent the usage of other options set on the `options` object.

### Additional notes on retry duration

If the fetch is unsuccessful, the retry logic determines how long it will wait before the next attempt.  If the time remaining will exceed the total time allowed by retryMaxDuration then another attempt will not be made.  There are examples of how this works in the testing code.

### Apache OpenWhisk Action Support

If you are running this in the context of an OpenWhisk action, it will take into account the action timeout deadline when setting the `retryMaxDuration`. It uses the `__OW_ACTION_DEADLINE` environment variable to determine if there is an action running.

Behavior:
If `retryMaxDuration` is greater than the time till the action will timeout, it will adjust the `retryMaxDuration` to be equal to the time till action timeout.

### Contributing
Contributions are welcomed! Read the [Contributing Guide](./.github/CONTRIBUTING.md) for more information.

### Licensing
This project is licensed under the Apache V2 License. See [LICENSE](LICENSE) for more information.
