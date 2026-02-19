# Edge Function Logging Setup

The 3 Supabase Edge Functions live outside this repo but should log to the same
`kith_climate.system_logs` table. Add the following snippet to each function.

## Functions to instrument

| Function | Trigger |
|----------|---------|
| `fathom-webhook` | Fathom `new_meeting_content_ready` |
| `calendly-webhook` | Calendly `invitee.created` / `invitee.canceled` |
| `stripe-kith-climate-webhook` | Stripe `checkout.session.completed` / `charge.refunded` |

## Logging snippet

Add this helper at the top of each edge function file:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function logInvocation(params: {
  functionName: string;
  httpMethod: string;
  status: "success" | "error";
  statusCode: number;
  durationMs: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );

    await supabase.from("system_logs").insert({
      function_name: params.functionName,
      function_type: "edge_function",
      http_method: params.httpMethod,
      status: params.status,
      status_code: params.statusCode,
      error_message: params.errorMessage || null,
      duration_ms: params.durationMs,
      metadata: params.metadata || {},
      invoked_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Failed to log invocation:", err);
  }
}
```

## Usage in each function

Wrap the existing `Deno.serve()` handler:

```typescript
Deno.serve(async (req) => {
  const start = Date.now();
  let logStatus: "success" | "error" = "success";
  let statusCode = 200;
  let errorMessage: string | undefined;

  try {
    // ... existing handler logic ...

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    logStatus = "error";
    statusCode = 500;
    errorMessage = err instanceof Error ? err.message : String(err);

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    await logInvocation({
      functionName: "fathom-webhook", // change per function
      httpMethod: req.method,
      status: logStatus,
      statusCode,
      durationMs: Date.now() - start,
      errorMessage,
    });
  }
});
```

## Required secrets

Each edge function needs these Supabase secrets (already set if using the
standard Supabase Edge Function runtime):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

The `system_logs` table has RLS policies allowing inserts from the anon key.
