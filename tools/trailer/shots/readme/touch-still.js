// README phone still (a tools/play.mjs script, not a rig shot): docs/images/touch.webp.
//   node tools/play.mjs --name readme-touch --mobile --size 844x390 --dpr 2 --params "outfit=elaina&lessons=0" --timeout 400 --script tools/trailer/shots/readme/touch-still.js
//   then cwebp -q 88 on .tmp/play/readme-touch/touch.png (1688x780)
// On foot in the City of Magic's gate street with the craft arts known; waits until the boot toasts and title card are gone.
G.quests.debugSkipTo('mages', 'inquire');
G.craft.learn('thread', { silent: true }); G.craft.learn('rewind', { silent: true });
G.state.stamps = { hometown: 1, forest: 1, wilds: 1, bellcrown: 1 };
T.teleport(-2160, -490, 30);
G.player.yaw = Math.PI;
await T.frames(700);
T.look(0, 0);
G.cam.yaw = 0; G.cam.pitch = -0.02;
await T.frames(120);
await T.shot('touch');
return { touch: !!G.ui.touch, where: G.ui.touch?.where?.('cast') };
