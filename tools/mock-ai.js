// Test helper: replaces calls to OpenRouter with canned replies so the developer menu can be
// tested without a real key or network. Paste into the browser console (local testing only).
window.__aiCalls = [];
const realFetch = window.fetch.bind(window);
window.fetch = async (url, opts) => {
  if (!String(url).includes('openrouter.ai')) return realFetch(url, opts);
  const body = JSON.parse(opts.body);
  const prompt = body.messages[1].content;
  window.__aiCalls.push({ model: body.model, auth: opts.headers.Authorization.slice(0, 12), prompt: prompt.slice(0, 60) });
  let reply;
  if (prompt.startsWith('Invent a brand-new deck')) {
    reply = { name: 'Camping Trip', icon: 'tent', groups: [
      { name: 'Camping Gear', singular: 'piece of camping gear', easy: ['tent', 'flashlight', 'cooler', 'map'], medium: ['sleeping bag', 'lantern', 'compass', 'bug spray', 'camp stove'], hard: ['tarp', 'mess kit', 'carabiner'] },
      { name: 'Campfire Fun', singular: 'campfire thing', easy: ['marshmallow', 'stick', 'sparks', 'logs'], medium: ['ghost story', 'hot dog roast', 'sing-along', 'smoke signal', 'fire pit'], hard: ['kindling', 'embers', 'flint'] },
      { name: 'Out in Nature', singular: 'nature thing', easy: ['owl', 'river', 'pine cone', 'stars'], medium: ['raccoon', 'trail', 'canoe trip', 'mosquito bite', 'firefly'], hard: ['moose', 'waterfall hike', 'bird call'] },
    ] };
  } else if (prompt.startsWith('Add new words')) {
    const ids = [...prompt.matchAll(/^([a-z0-9-]+): /gm)].map((m) => m[1]);
    reply = { words: ids.flatMap((id, i) => [
      { group: id, word: `zany thing ${i}a`, level: 'easy' },
      { group: id, word: `quirky item ${i}b`, level: 'medium' },
      { group: id, word: 'cow', level: 'easy' },                // duplicate: must be dropped
      { group: id, word: 'stupid hat', level: 'easy' },         // blocked word: must be dropped
      { group: id, word: 'party \u{1F389}', level: 'easy' },    // emoji: must be dropped
      { group: 'nope', word: 'lost word', level: 'easy' },      // unknown group: must be dropped
    ]) };
  } else if (prompt.startsWith('For a game like Taboo')) {
    const words = prompt.match(/Words: (.*)\n/)[1].split(', ');
    reply = { cards: words.slice(0, 10).map((w, i) => ({ word: w, banned: i === 0 ? [w, 'a', 'b', 'c'] : ['alpha', 'beta', 'gamma', 'delta'] })) };
  } else if (prompt.startsWith('Write 25 NEW questions')) {
    reply = { questions: ["What's the best thing to pack for a picnic?", 'Name something you find in a garden.', "What's the best pizza topping?", 'no capital letter?', 'What makes a good friend?'] };
  } else if (prompt.startsWith('Write 20 NEW scales')) {
    reply = { scales: [['Tiny bug', 'Huge bug'], ['Cold', 'Hot'], ['Same', 'Same'], ['Bad hat', 'Great hat']] };
  } else if (prompt.startsWith('Add ideas for a drawing game')) {
    reply = { describing: ['bouncy', 'two words'], things: ['walrus', 'giant robot', 'sleepy'], doing: ['riding a camel', 'brushing his hair'] };
  }
  const text = 'Sure! ' + JSON.stringify(reply) + ' Hope that helps.';
  return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
'mock ready';
