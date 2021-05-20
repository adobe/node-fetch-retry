import {RequestInfo, RequestInit, Response} from 'node-fetch'

export interface RequestInitWithRetry extends RequestInit {
  retryOptions?: {
    retryMaxDuration?: number
    retryInitialDelay?: number
    retryBackoff?: number
    retryOnHttpResponse?: (response: Response) => boolean
    socketTimeout?: number
    forceSocketTimeout?: boolean
  }
}

declare function fetch(
  url: RequestInfo,
  init?: RequestInitWithRetry
): Promise<Response>

export default fetch
