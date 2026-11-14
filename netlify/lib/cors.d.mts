export declare function corsHeaders(req: Request): Record<string, string>;
export declare function withCors<C>(
  handler: (req: Request, context: C) => Response | Promise<Response>,
): (req: Request, context: C) => Promise<Response>;
