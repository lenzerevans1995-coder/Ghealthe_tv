/* The board hub: one Durable Object holding every open board socket.
   
   Boards used to poll the feed on a timer, which meant a sale could sit on
   Onyx's side for the better part of a minute before the floor saw it. The
   webhook that carries that sale already reaches the Worker within seconds —
   what was missing was a way to tell the boards. A Worker is stateless and
   cannot hold a connection, so the sockets live here instead, and the webhook
   and ingest paths poke this object when the standings actually change. */
export class BoardHub {
  constructor(state) {
    this.state = state;
    this.sockets = new Set();
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/connect' && request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const server = pair[1];
      server.accept();
      this.sockets.add(server);
      // A TV drops off wifi without closing cleanly, so clear on both events
      // rather than leaking a socket per overnight blip.
      const drop = () => this.sockets.delete(server);
      server.addEventListener('close', drop);
      server.addEventListener('error', drop);
      // Say hello so a board can tell "connected" from "still trying".
      try { server.send(JSON.stringify({ type: 'hello' })); } catch (e) { drop(); }
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (url.pathname === '/broadcast') {
      const body = await request.text();
      let sent = 0;
      for (const s of [...this.sockets]) {
        try { s.send(body); sent++; }
        catch (e) { this.sockets.delete(s); }   // already gone
      }
      return Response.json({ sent, open: this.sockets.size });
    }

    if (url.pathname === '/status') {
      return Response.json({ open: this.sockets.size });
    }
    return new Response('not found', { status: 404 });
  }
}

/* One named instance: every board and every webhook meet at the same object.
   A handful of TVs is nowhere near what a single DO can carry. */
export function hub(env) {
  return env.BOARD_HUB.get(env.BOARD_HUB.idFromName('boards'));
}

// Never let a notification failure take down the write that caused it: the
// standings landing in D1 matters, telling the screens is best effort.
export async function notifyBoards(env, payload) {
  try {
    await hub(env).fetch('https://hub/broadcast', {
      method: 'POST',
      body: JSON.stringify({ type: 'standings', at: new Date().toISOString(), ...payload }),
    });
  } catch (e) { /* boards fall back to their poll */ }
}
