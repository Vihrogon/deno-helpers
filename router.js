/**
 * A router designed to work with Deno.serve()
 * **CAN THROW**
 * @example
 * import { Router } from "./router.ts";
 *
 * const router = new Router();
 *
 * router.get("/", ({ req, params }) => {
 *     return new Response("Example!");
 * });
 *
 * Deno.serve((req) => {
 *     return router.route(req);
 * });
 */
export class Router {
    #routes = new Map([
        ["GET", new Map()],
        ["POST", new Map()],
        ["PATCH", new Map()],
        ["DELETE", new Map()],
    ]);

    #add(method, pathname, handler) {
        if (typeof pathname !== "string" || pathname === "") {
            throw new Error("Invalid pathname");
        }

        this.#routes.get(method)?.set(pathname, handler);
    }

    // TODO handle more parameters
    #parseParams(url, reqUrl) {
        const pathname = url.exec(reqUrl)?.pathname.groups;
        const search = url.exec(reqUrl)?.search.groups;
        const params = {};

        if (Object.keys(pathname).length) params.pathname = pathname;
        if (Object.keys(search).length) params.search = search;
                    
        return params;
    }

    // TODO handle more than JSON
    async #parseBody(req) {
        try {
            return JSON.parse(await req.text());
        } catch (_) {
            return null;
        }
    }

    /**
     * Register a function to handle GET requests at a given path
     * @example
     * router.get("/", ({ req, params }) => {
     *     return new Response("Example!");
     * });
     * @param {string} pathnames
     * @param {Function} handler
     */
    get(pathname, handler) {
        this.#add("GET", pathname, handler);
    }

    /**
     * Register a function to handle POST requests at a given path
     * @example
     * router.post("/", ({ req }) => {
     *     const body = await req.json();
     *     return new Response("Example!");
     * });
     * @param {string} pathname
     * @param {Function} handler
     */
    post(pathname, handler) {
        this.#add("POST", pathname, handler);
    }

    /**
     * Register a function to handle PATCH requests at a given path
     * @example
     * router.patch("/", ({ req }) => {
     *     const body = await req.json();
     *     return new Response("Example!");
     * });
     * @param {string} pathname
     * @param {Function} handler
     */
    patch(pathname, handler) {
        this.#add("PATCH", pathname, handler);
    }

    /**
     * Register a function to handle DELETE requests at a given path
     * @example
     * router.delete("/", ({ req }) => {
     *     const body = await req.json();
     *     return new Response("Example!");
     * });
     * @param {string} pathname
     * @param {Function} handler
     */
    delete(pathname, handler) {
        this.#add("DELETE", pathname, handler);
    }

    /**
     * Specify a path and a root directory to stream files from
     * @example
     * router.serve("/static", "static");
     * // a shorthand for the above
     * router.serve();
     * @param {string} pathname - will handle requests to this path
     * @param {string} foldername - will serve files from this root directory
     */
    static(pathname = "/static", foldername = "static") {
        this.#add("GET", `${pathname}/:path*`, async ({ params }) => {
            try {
                const file = await Deno.open(`./${foldername}/` + params.pathname.path, {
                    read: true,
                });

                const readableStream = file.readable;

                const headers = new Headers();

                // TODO add more types
                if (params.pathname.path.endsWith('.js')) {
                    headers.append("content-type", "text/javascript");
                }
                
                return new Response(readableStream, { headers });
            } catch (_error) {
                return new Response("Not Found", { status: 404 });
            }
        });
    }

    /**
     * Attach the router to Deno.serve()
     * @example
     * Deno.serve((req) => {
     *     return router.route(req);
     * });
     * @param {Request} req - Request passed from Deno.serve()
     * @returns {Response} Response
     */
    async route(req) {
        let status = 405;
        if (this.#routes.has(req.method)) {
            status = 404;

            for (const [pathname, handler] of this.#routes.get(req.method)) {
                const url = new URLPattern({ pathname });

                if (url.test(req.url)) {
                    const params = this.#parseParams(url, req.url);
                    const body = await this.#parseBody(req);

                    try {
                        return await handler({ req, params, body });
                    } catch (_) {
                        status = 500;
                    }
                }
            }
        }

        return new Response(null, { status });
    }
}

import {
    assertEquals,
    assertThrows,
} from "https://deno.land/std@0.172.0/testing/asserts.ts";

Deno.test("Router - invalid pathname throws", () => {
    const router = new Router();
    assertThrows(
        () => router.get("", () => new Response(null)),
        Error,
        "Invalid pathname",
    );
});

Deno.test("Router - get route with params works", async () => {
    const router = new Router();
    router.get("/test/:id", ({ params }) => {
        return new Response(`test, ${params.pathname.id}!`);
    });
    const response = await router.route(
        new Request("http://localhost/test/123"),
    );
    assertEquals(await response.text(), "test, 123!");
});

Deno.test("Router - post route with body works", async () => {
    const router = new Router();
    router.post("/test", async ({ body }) => {
        return new Response(`test, ${body.test}!`);
    });
    const response = await router.route(
        new Request("http://localhost/test", {
            method: "POST",
            body: JSON.stringify({ test: "TEST" }),
        }),
    );
    assertEquals(await response.text(), "test, TEST!");
});

Deno.test("Router - patch route with body works", async () => {
    const router = new Router();
    router.patch("/test", async ({ body }) => {
        return new Response(`test, ${body.test}!`);
    });
    const response = await router.route(
        new Request("http://localhost/test", {
            method: "PATCH",
            body: JSON.stringify({ test: "TEST" }),
        }),
    );
    assertEquals(await response.text(), "test, TEST!");
});

Deno.test("Router - delete route with body works", async () => {
    const router = new Router();
    router.delete("/test", async ({ body }) => {
        return new Response(`test, ${body.test}!`);
    });
    const response = await router.route(
        new Request("http://localhost/test", {
            method: "DELETE",
            body: JSON.stringify({ test: "TEST" }),
        }),
    );
    assertEquals(await response.text(), "test, TEST!");
});

Deno.test("Router - unknown method returns 405", async () => {
    const router = new Router();
    const response = await router.route(
        new Request("http://localhost/test", { method: "TEST" }),
    );
    assertEquals(response.status, 405);
});

Deno.test("Router - unknown route returns 404", async () => {
    const router = new Router();
    router.get("/test", () => new Response(null));
    const response = await router.route(
        new Request("http://localhost/bar"),
    );
    assertEquals(response.status, 404);
});

Deno.test("Router - server error returns 500", async () => {
    const router = new Router();
    router.get("/test", () => {
        throw new Error("TEST");
    });
    const response = await router.route(
        new Request("http://localhost/test"),
    );
    assertEquals(response.status, 500);
});
