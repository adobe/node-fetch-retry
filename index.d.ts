import {RequestInfo, RequestInit, Response} from 'node-fetch'

export interface RetryOptions{
  retryMaxDuration?: number
  retryInitialDelay?: number
  retryBackoff?: number
  retryOnHttpError?: (error: Error) => boolean
  retryOnHttpResponse?: (response: Response) => boolean
  socketTimeout?: number
  forceSocketTimeout?: boolean
}

export interface RequestInitWithRetry extends RequestInit {
  retryOptions?: RetryOptions | false
}

declare function fetch(
  url: RequestInfo,
  init?: RequestInitWithRetry
): Promise<Response>

export default fetch
