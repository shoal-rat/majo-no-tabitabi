// Pose correction in the rig's bind axes. Source rotations are absolute local
// quaternions on identity-rest VRoid joints. Key times, root motion and contact
// markers belong to the original clips and are shared with the other actors.
const DEG = 180 / Math.PI;
const modeOf = name => {
  if (name === 'Idle_Loop') return 'idle';
  if (/^Walk_(Loop|Formal_Loop)$/.test(name)) return 'walk';
  if (name === 'Jog_Fwd_Loop' || name === 'Sprint_Loop') return 'run';
  // landings keep their authored legs: the hips drop into the crouch and the soles have to stay on the ground
  if (/^(Jump|NinjaJump)_Land$/.test(name)) return 'land';
  if (/^(Jump|NinjaJump)_(Start|Loop|Idle_Loop)$/.test(name)) return 'jump';
  if (/^(Cast_|Charm_Throw|Spell_Simple_Shoot)/.test(name)) return 'cast';
  if (name === 'Broom_Ride_Loop' || name === 'Broom_Boost_Loop') return 'ride';
  return null;
};
const beyond = (angle,start,factor) => Math.sign(angle) *
  (Math.min(Math.abs(angle),start) + Math.max(0,Math.abs(angle)-start)*factor);
const lerp = (a,b,t) => a+(b-a)*t;

// Parameters are in each joint's logarithmic rotation vector. This avoids an
// Euler discontinuity on running elbows and wrist rolls. At a half-turn a
// swing axis is ambiguous, so large spins smoothly pass through unmodified.
function pose(mode,joint,side,x,y,z) {
  if (mode === 'jump') {
    // Airborne: a light, compact tuck. Knees close together and a little
    // forward under the hem, shins in line with the thighs, arms relaxed
    // near the body instead of spreading level with the shoulders.
    if (joint === 'UpperLeg') return [beyond(x-16,34,.3), y*.5, beyond(z,5,.22)];
    if (joint === 'LowerLeg') return [beyond(x,35,.53), y*.3, z*.3];
    if (joint === 'Foot') return [x*.9, y*.72, z*.70];
    if (joint === 'UpperArm') return [x*.90, y*.88, lerp(z,-side*74,.82)];
    if (joint === 'Hand') return [x*.75,y*.70,z*.73];
    if (joint === 'Chest' || joint === 'UpperChest') return [x*.76,y*.88,z*.9];
  }
  if (mode === 'land') {
    // The knees take the drop; the chest bows less so her head stays up.
    if (joint === 'Chest' || joint === 'UpperChest') return [x*.65,y*.85,z*.85];
    if (joint === 'UpperArm') return [x*.90, y*.88, lerp(z,-side*70,.5)];
    if (joint === 'Hand') return [x*.75,y*.70,z*.73];
  }
  if (mode === 'ride') {
    // The two knees hang at different heights. The left foot trails slightly
    // behind the right like a side-saddle rider; both thighs keep seat contact.
    if (joint === 'UpperLeg') return [x+(side>0?11:3), y*.90+4, z*.90];
    if (joint === 'LowerLeg') return [x+(side>0?4:-8), y*.74, z*.78];
    if (joint === 'Foot') return [x*.74+3, y*.68, z*.70];
    if (joint === 'Shoulder') return [x*.85,y*.77,z*.70];
    if (joint === 'Hand') return [x*.76,y*.75,z*.72];
    if (joint === 'Chest' || joint === 'UpperChest') return [x*.89, y*.84, z*.90];
  }
  if (mode === 'cast') {
    // Open the right (staff) side of the sweep and push its elbow in front of
    // the clavicle. The shaft passes ahead of the cheek and beneath the brim.
    if (joint === 'UpperArm') return [x+(side<0?13:5),y*.95,z+(side<0?5:-4)];
    if (joint === 'Hand') return [x*.81,y*.86,z*.76];
    if (joint === 'Shoulder') return [x*.91,y*.90,z*.84];
    if (joint === 'UpperChest') return [x*.94,y*.94,z*.90];
  }
  if (mode === 'idle' || mode === 'walk' || mode === 'run') {
    // The loaded knee and ankle keep their stance curves. During the airborne
    // part of the fast gait, ease the last few degrees of heel lift under the hem.
    if (mode==='run' && joint==='LowerLeg') return [beyond(x,88,.64),y,z];
    // Relax the upper body above that contact path.
    if (joint === 'Chest' || joint === 'UpperChest')
      return [x*(mode==='run'?.72:.76), y*(mode==='run'?.72:.86), z*.82];
    if (joint === 'Shoulder') return [x*.82,y*.77,z*.78];
    if (joint === 'Hand') return [x*.78,y*.70,z*.68];
    if (joint === 'UpperArm') {
      const target=mode==='run'?60:66, strength=mode==='run'?.29:.16;
      return [x*.96,y*.97,lerp(z,-side*target,strength)];
    }
    if (joint === 'LowerArm') return [x*.96,y*(mode==='run'?.93:.85),z*.95];
  }
  return null;
}

/** A fresh, corrected quaternion track, or null for an unchanged channel.
 * Used by the live clip cache and independent GLB export. */
export function heroineRotationTrack(clipName,boneName,source) {
  const mode=modeOf(clipName);
  const match=/^J_Bip_([LRC])_(UpperLeg|LowerLeg|Foot|UpperArm|LowerArm|Shoulder|Hand|Chest|UpperChest)$/.exec(boneName);
  if (!mode || !match || !source.length || source.length%4) return null;
  const side=match[1]==='L'?1:match[1]==='R'?-1:0, joint=match[2];
  if (!pose(mode,joint,side,0,0,0)) return null;
  const output=new Float32Array(source.length);
  for(let i=0;i<source.length;i+=4) {
    const sign=source[i+3]<0?-1:1;
    const x=source[i]*sign,y=source[i+1]*sign,z=source[i+2]*sign,w=source[i+3]*sign;
    const l=Math.hypot(x,y,z),t=2*Math.atan2(l,w),c=l>1e-8?t*DEG/l:2*DEG;
    const v=[x*c,y*c,z*c], target=pose(mode,joint,side,...v);
    const fade=Math.min(1,Math.max(0,(Math.PI-t)/.34));
    const q=target.map((a,k)=>lerp(v[k],a,fade)/DEG);
    const theta=Math.hypot(...q),f=(theta>1e-8?Math.sin(theta/2)/theta:.5)*sign;
    output[i]=q[0]*f;output[i+1]=q[1]*f;output[i+2]=q[2]*f;output[i+3]=Math.cos(theta/2)*sign;
  }
  return output;
}

// Land_Hard is a planted, one-handed crouch. Steer the left knee around the
// hip-to-ankle line instead of clamping flexion: the ankle stays at its authored
// point, and a compensating ankle rotation keeps the sole on its original plane.
export function fitLandingKnee(clip,model) {
  if (clip.name!=='Land_Hard') return null;
  const names=['J_Bip_C_Hips','J_Bip_L_UpperLeg','J_Bip_L_LowerLeg','J_Bip_L_Foot'];
  const bones=names.map(n=>model.getObjectByName(n));
  const src=names.map(n=>clip.tracks.find(t=>t.name===n+'.quaternion'));
  if(bones.some(b=>!b)||src.some(t=>!t)) return null;
  // The source keeps long holds between keys. Resample the corrected rotations
  // through those intervals so interpolated contact also stays sub-millimetre.
  const keyTimes=src.flatMap(t=>Array.from(t.times));
  for(let t=0;t<clip.duration;t+=1/240)keyTimes.push(t);
  const times=Float32Array.from([...new Set(keyTimes.map(t=>Math.fround(t)))].sort((a,b)=>a-b));
  const evaluators=src.map(t=>t.createInterpolant()), upper=[],foot=[];
  const hip=bones[0].quaternion.clone(),thigh=hip.clone(),knee=hip.clone(),ankle=hip.clone(),chain=hip.clone(),twist=hip.clone(),newThigh=hip.clone(),newFoot=hip.clone();
  const invHip=hip.clone();
  const k=bones[2].position.clone(),a=k.clone(),axis=k.clone(),pole=k.clone(),radial=k.clone(),desired=k.clone(),scratch=k.clone();
  for(const t of times) {
    [hip,thigh,knee,ankle].forEach((q,i)=>q.fromArray(evaluators[i].evaluate(t)));
    k.copy(bones[2].position).applyQuaternion(thigh);
    chain.multiplyQuaternions(thigh,knee);
    a.copy(bones[3].position).applyQuaternion(chain).add(k);
    axis.copy(a).normalize();
    radial.copy(k).addScaledVector(axis,-k.dot(axis)).normalize();
    // +X is the heroine's outside on this leg. Define the pole in model space,
    // then transform it back through the animated pelvis into the thigh's frame.
    pole.set(.9,-.31,.40).applyQuaternion(invHip.copy(hip).invert());
    desired.copy(pole).addScaledVector(axis,-pole.dot(axis)).normalize();
    const rise=scratch.copy(k).applyQuaternion(hip).y;
    let w=Math.min(1,Math.max(0,(rise+.012)/.145)); w*=w*(3-2*w);
    const signed=Math.atan2(axis.dot(scratch.crossVectors(radial,desired)),radial.dot(desired));
    twist.setFromAxisAngle(axis,Math.max(-.7,Math.min(.7,signed))*w);
    newThigh.multiplyQuaternions(twist,thigh);
    newFoot.multiplyQuaternions(newThigh,knee).invert().multiply(chain).multiply(ankle).normalize();
    upper.push(newThigh.x,newThigh.y,newThigh.z,newThigh.w);
    foot.push(newFoot.x,newFoot.y,newFoot.z,newFoot.w);
  }
  return new Map([[src[1].name,{times,values:new Float32Array(upper)}],[src[3].name,{times,values:new Float32Array(foot)}]]);
}
