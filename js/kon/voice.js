// Kon's own voice: short first-person lines in a speech bubble.
// (The narrator's third-person lines live in captions.js.)
//
// Kon doesn't talk all the time. `chance` is how often a moment gets a line,
// and the brain also rate-limits so bubbles never pile up.

export const VOICE = {
  greet: { chance: 1, lines: ['Oh! It’s you.', 'Hi again!', 'You came back!'] },
  noticed: { chance: 0.5, lines: ['…!', 'Uh-oh.', 'Oops.'] },
  startled: { chance: 1, lines: ['Eep!', 'Wah!', 'Yikes!'] },
  resuming: { chance: 0.4, lines: ['…is it safe?', 'Just one peek.', 'Hm?'] },
  snapback: { chance: 0.6, lines: ['Not looking!', 'I saw nothing.'] },

  meditate: { chance: 0.6, lines: ['Ommm…', 'So calm. Very calm.'] },
  whistle: { chance: 0.5, lines: ['♪ hm-hm-hmm ♪', 'Nice weather, huh?'] },
  groom: { chance: 0.5, lines: ['Busy. Very busy.', 'Just washing up.'] },
  flower: { chance: 0.6, lines: ['Pretty flower.', 'Hello, flower.'] },
  sky: { chance: 0.6, lines: ['Ooh, a cloud.', 'Was that a bird?'] },
  lapseNight: { chance: 0.8, lines: ['Whoa. Pretty…', 'Bye, sun!'] },
  lapseDay: { chance: 0.8, lines: ['Wait, morning?!', 'Did I sleep?'] },
  fakesleep: { chance: 0.7, lines: ['Zzz… (totally asleep)', 'Snore. Snore.'] },
  readPlaques: { chance: 0.6, lines: ['So many wishes…', 'Ooh, this one’s good.'] },

  typingWalk: { chance: 1, lines: ['What’cha writing?', 'Ooh, a wish?'] },
  typingStop: { chance: 0.8, lines: ['I wasn’t reading!', 'Didn’t see a thing!'] },
  admire: { chance: 1, lines: ['Bye-bye, wish!', 'Fly safe!'] },

  pounce: { chance: 0.7, lines: ['Hup!', 'Gotcha!'] },
  pounceMiss: { chance: 1, lines: ['It was right there…', 'Huh? Where’d it go?'] },
  pounceLeaf: { chance: 1, lines: ['Got it! …nope.', 'Come back, leaf!'] },

  gotcha: { chance: 1, lines: ['Ha! Saw that!', 'You moved!'] },
  satori: { chance: 1, lines: ['Ommmmm…', 'I see… everything…'] },
  satoriEnd: { chance: 1, lines: ['Wait— whoa!', 'Oof.'] },
  waking: { chance: 1, lines: ['Huh? I wasn’t asleep!', 'Five more minutes…'] },
  drowsy: { chance: 0.6, lines: ['*yawn*', 'So sleepy…'] },

  judgeGreat: { chance: 1, lines: ['Perfect!', 'Wow. Teach me!'] },
  judgeGood: { chance: 1, lines: ['Not bad!', 'Pretty round!'] },
  judgeMeh: { chance: 1, lines: ['Um… a potato?', 'Is that… a circle?'] },

  petted: { chance: 1, lines: ['…more, please.', 'Mmm. Okay. Fine.'] },
  pettedAfter: { chance: 0.8, lines: ['That never happened.', 'I don’t like pets.'] },
  booped: { chance: 1, lines: ['Hey!', 'Boop?!'] },
  sneeze: { chance: 1, lines: ['Achoo!', 'Hah— choo!'] },
  dizzy: { chance: 1, lines: ['Whoaaa…', 'The garden is spinning…'] },

  lifeDrink: { chance: 0.5, lines: ['Mm, cold.', 'Slurp.'] },
  lifeSnail: { chance: 0.7, lines: ['Hi, snail.', 'Boop, snail.'] },
  lifeRock: { chance: 0.6, lines: ['So warm…', 'Best rock.'] },
  lifeShishiClack: { chance: 1, lines: ['Every time!', 'Gah!'] },
  lifeLantern: { chance: 0.5, lines: ['Cozy.', 'Warm paws.'] },
  lifeMaple: { chance: 0.5, lines: ['One… two… many.', 'So many leaves.'] },
  lifeSniff: { chance: 0.4, lines: ['Sniff sniff.', 'What’s this?'] },
  stalk: { chance: 0.6, lines: ['…', 'Shhh.'] },

  birdHunt: { chance: 0.5, lines: ['Birdie…', 'Sneak, sneak…'] },
  birdWatch: { chance: 0.5, lines: ['Hey, bird.', 'Come down here…'] },
  birdChatter: { chance: 0.9, lines: ['Ek-ek-ek-ek!', 'Kekekeke!'] },
  birdEscaped: { chance: 0.8, lines: ['Aw, come back!', 'I was just looking!'] },
  birdGone: { chance: 0.5, lines: ['Bye, bird.', 'Aww.'] },
  pounceBird: { chance: 1, lines: ['Next time, bird!', 'I almost had it!'] },
  birdOnHead: { chance: 0.7, lines: ['(Don’t move. Don’t move.)', '(Is that… a bird?)'] },
};

/** How long a line stays up: a moment for "Eep!", longer for a sentence. */
export const voiceDuration = (text) => Math.min(3.2, 1.2 + text.length * 0.055);
