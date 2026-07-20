type InterceptorLike<TContext> = {
  beforeRequest?: (context: TContext) => void | Promise<void>;
  afterResponse?: (response: Response, context: TContext) => void | Promise<void>;
  onError?: (error: unknown, context: TContext) => void | Promise<void>;
};

export async function runBeforeRequestInterceptors<
  TContext,
  TInterceptor extends InterceptorLike<TContext>,
>(interceptors: TInterceptor[], context: TContext) {
  for (const interceptor of interceptors) {
    await interceptor.beforeRequest?.(context);
  }
}

export async function runAfterResponseInterceptors<
  TContext,
  TInterceptor extends InterceptorLike<TContext>,
>(interceptors: TInterceptor[], response: Response, context: TContext) {
  for (const interceptor of interceptors) {
    await interceptor.afterResponse?.(response, context);
  }
}

export async function runOnErrorInterceptors<
  TContext,
  TInterceptor extends InterceptorLike<TContext>,
>(interceptors: TInterceptor[], error: unknown, context: TContext) {
  for (const interceptor of interceptors) {
    await interceptor.onError?.(error, context);
  }
}
