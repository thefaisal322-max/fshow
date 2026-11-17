import AsyncStorage from '@react-native-async-storage/async-storage';

/** Emoji picker data (like Messenger's "+" sheet). Space-separated so joined emojis (👨‍👩‍👧) stay whole. */
export type EmojiGroup = { key: string; icon: string; label: { ps: string; en: string; fa: string }; list: string[] };

const g = (s: string) => s.trim().split(/\s+/);

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    key: 'smileys',
    icon: '😀',
    label: { ps: 'خندا او خلک', en: 'Smileys & people', fa: 'شکلک و آدم‌ها' },
    list: g(`😀 😃 😄 😁 😆 🥹 😅 😂 🤣 🥲 ☺️ 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😮‍💨 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🫣 🤗 🫡 🤔 🫢 🤭 🤫 🤥 😶 😐 😑 😬 🫨 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 😵‍💫 🫥 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 👹 👺 🤡 💩 👻 💀 ☠️ 👽 👾 🤖 🎃 😺 😸 😹 😻 😼 😽 🙀 😿 😾
      👋 🤚 🖐️ ✋ 🖖 🫱 🫲 🫳 🫴 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 🫵 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦾 🦵 🦶 👂 👃 🧠 🫀 🫁 🦷 🦴 👀 👁️ 👅 👄 🫦
      👶 🧒 👦 👧 🧑 👱 👨 🧔 👩 🧓 👴 👵 🙍 🙎 🙅 🙆 💁 🙋 🧏 🙇 🤦 🤷 👮 🕵️ 💂 🥷 👷 🫅 🤴 👸 👳 👲 🧕 🤵 👰 🤰 🫃 🤱 👼 🎅 🤶 🦸 🦹 🧙 🧚 🧛 🧜 🧝 🧞 🧟 💆 💇 🚶 🧍 🧎 🏃 💃 🕺 👯 🧖 🧗 🤺 🏇 ⛷️ 🏂 🏌️ 🏄 🚣 🏊 ⛹️ 🏋️ 🚴 🚵 🤸 🤼 🤽 🤾 🤹 🧘 🛀 🛌 👭 👫 👬 💏 💑 👪
      👨‍⚕️ 👩‍⚕️ 👨‍🎓 👩‍🎓 👨‍🏫 👩‍🏫 👨‍🌾 👩‍🌾 👨‍🍳 👩‍🍳 👨‍🔧 👩‍🔧 👨‍💻 👩‍💻 👨‍🎤 👩‍🎤 👨‍🎨 👩‍🎨 👨‍✈️ 👩‍✈️ 👨‍🚀 👩‍🚀 👨‍🚒 👩‍🚒
      👓 🕶️ 🥽 🥼 🦺 👔 👕 👖 🧣 🧤 🧥 🧦 👗 👘 🥻 🩱 🩲 🩳 👙 👚 👛 👜 👝 🎒 🧳 👞 👟 🥾 🥿 👠 👡 🩰 👢 👑 👒 🎩 🎓 🧢 🪖 ⛑️ 💄 💍 💼`),
  },
  {
    key: 'animals',
    icon: '🐻',
    label: { ps: 'څاروي او طبیعت', en: 'Animals & nature', fa: 'حیوانات و طبیعت' },
    list: g(`🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐻‍❄️ 🐨 🐯 🦁 🐮 🐷 🐽 🐸 🐵 🙈 🙉 🙊 🐒 🐔 🐧 🐦 🐤 🐣 🐥 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪱 🐛 🦋 🐌 🐞 🐜 🪰 🪲 🪳 🦟 🦗 🕷️ 🕸️ 🦂 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦐 🦞 🦀 🪼 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🦭 🐊 🐅 🐆 🦓 🦍 🦧 🦣 🐘 🦛 🦏 🐪 🐫 🦒 🦘 🦬 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🦙 🐐 🦌 🐕 🐩 🦮 🐕‍🦺 🐈 🐈‍⬛ 🪶 🐓 🦃 🦤 🦚 🦜 🦢 🦩 🕊️ 🐇 🦝 🦨 🦡 🦫 🦦 🦥 🐁 🐀 🐿️ 🦔 🐾 🐉 🐲
      🌵 🎄 🌲 🌳 🌴 🪵 🌱 🌿 ☘️ 🍀 🎍 🪴 🎋 🍃 🍂 🍁 🪺 🪹 🍄 🐚 🪸 🪨 🌾 💐 🌷 🌹 🥀 🪻 🌺 🌸 🌼 🌻 🌞 🌝 🌛 🌜 🌚 🌕 🌖 🌗 🌘 🌑 🌒 🌓 🌔 🌙 🌎 🌍 🌏 🪐 💫 ⭐ 🌟 ✨ ⚡ ☄️ 💥 🔥 🌪️ 🌈 ☀️ 🌤️ ⛅ 🌥️ ☁️ 🌦️ 🌧️ ⛈️ 🌩️ 🌨️ ❄️ ☃️ ⛄ 🌬️ 💨 💧 💦 🫧 ☔ ☂️ 🌊 🌫️`),
  },
  {
    key: 'food',
    icon: '🍔',
    label: { ps: 'خواړه', en: 'Food & drink', fa: 'غذا و نوشیدنی' },
    list: g(`🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🫑 🌽 🥕 🫒 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🫓 🥪 🥙 🧆 🌮 🌯 🫔 🥗 🥘 🫕 🥫 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🦪 🍤 🍙 🍚 🍘 🍥 🥠 🥮 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🌰 🥜 🍯 🥛 🍼 🫖 ☕ 🍵 🧃 🥤 🧋 🍶 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🧉 🍾 🧊 🥄 🍴 🍽️ 🥣 🥡 🥢 🧂`),
  },
  {
    key: 'activity',
    icon: '⚽',
    label: { ps: 'لوبې', en: 'Activities', fa: 'فعالیت‌ها' },
    list: g(`⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🪃 🥅 ⛳ 🪁 🏹 🎣 🤿 🥊 🥋 🎽 🛹 🛼 🛷 ⛸️ 🥌 🎿 🏆 🥇 🥈 🥉 🏅 🎖️ 🏵️ 🎗️ 🎫 🎟️ 🎪 🎭 🩰 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🪘 🎷 🎺 🪗 🎸 🪕 🎻 🪈 🎲 ♟️ 🎯 🎳 🎮 🎰 🧩 🎉 🎊 🎈 🎁 🎀 🪅 🪩`),
  },
  {
    key: 'travel',
    icon: '🚗',
    label: { ps: 'سفر او ځایونه', en: 'Travel & places', fa: 'سفر و مکان‌ها' },
    list: g(`🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🦯 🦽 🦼 🛴 🚲 🛵 🏍️ 🛺 🚨 🚔 🚍 🚘 🚖 🚡 🚠 🚟 🚃 🚋 🚞 🚝 🚄 🚅 🚈 🚂 🚆 🚇 🚊 🚉 ✈️ 🛫 🛬 🛩️ 💺 🛰️ 🚀 🛸 🚁 🛶 ⛵ 🚤 🛥️ 🛳️ ⛴️ 🚢 ⚓ 🛟 ⛽ 🚧 🚦 🚥 🗺️ 🗿 🗽 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠 ⛲ ⛱️ 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏔️ 🗻 🏕️ ⛺ 🛖 🏠 🏡 🏘️ 🏚️ 🏗️ 🏭 🏢 🏬 🏣 🏤 🏥 🏦 🏨 🏪 🏫 🏩 💒 🏛️ ⛪ 🕌 🕋 🛕 🕍 ⛩️ 🌅 🌄 🌠 🎇 🎆 🌇 🌆 🏙️ 🌃 🌌 🌉 🌁`),
  },
  {
    key: 'objects',
    icon: '💡',
    label: { ps: 'شیان', en: 'Objects', fa: 'اشیا' },
    list: g(`⌚ 📱 📲 💻 ⌨️ 🖥️ 🖨️ 🖱️ 💽 💾 💿 📀 📼 📷 📸 📹 🎥 📽️ 🎞️ 📞 ☎️ 📟 📠 📺 📻 🎙️ 🎚️ 🎛️ 🧭 ⏱️ ⏲️ ⏰ 🕰️ ⌛ ⏳ 📡 🔋 🪫 🔌 💡 🔦 🕯️ 🪔 🧯 🛢️ 💸 💵 💴 💶 💷 🪙 💰 💳 💎 ⚖️ 🪜 🧰 🪛 🔧 🔨 ⚒️ 🛠️ ⛏️ 🪚 🔩 ⚙️ 🪤 🧱 ⛓️ 🧲 🔫 💣 🧨 🪓 🔪 🗡️ ⚔️ 🛡️ 🚬 ⚰️ 🪦 ⚱️ 🏺 🔮 📿 🧿 🪬 💈 ⚗️ 🔭 🔬 🕳️ 🩹 🩺 🩻 💊 💉 🩸 🧬 🦠 🧫 🧪 🌡️ 🧹 🪠 🧺 🧻 🚽 🚰 🚿 🛁 🧼 🪥 🪒 🧽 🪣 🧴 🛎️ 🔑 🗝️ 🚪 🪑 🛋️ 🛏️ 🧸 🪆 🖼️ 🪞 🪟 🛍️ 🛒 🎁 🎈 🧧 ✉️ 📩 📨 📧 💌 📥 📤 📦 🏷️ 📪 📫 📬 📭 📮 📯 📜 📃 📄 📑 🧾 📊 📈 📉 🗒️ 🗓️ 📆 📅 🗑️ 📇 🗃️ 🗳️ 🗄️ 📋 📁 📂 🗂️ 🗞️ 📰 📓 📔 📒 📕 📗 📘 📙 📚 📖 🔖 🧷 🔗 📎 🖇️ 📐 📏 🧮 📌 📍 ✂️ 🖊️ 🖋️ ✒️ 🖌️ 🖍️ 📝 ✏️ 🔍 🔎 🔏 🔐 🔒 🔓`),
  },
  {
    key: 'symbols',
    icon: '❤️',
    label: { ps: 'نښې', en: 'Symbols', fa: 'نمادها' },
    list: g(`❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 🩷 🩵 🩶 💔 ❤️‍🔥 ❤️‍🩹 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉️ ☸️ ✡️ 🔯 🕎 ☯️ ☦️ 🛐 ⛎ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ 🆔 ⚛️ 🉑 ☢️ ☣️ 📴 📳 🈶 🈚 🈸 🈺 🈷️ ✴️ 🆚 💮 🉐 ㊙️ ㊗️ 🈴 🈵 🈹 🈲 🅰️ 🅱️ 🆎 🆑 🅾️ 🆘 ❌ ⭕ 🛑 ⛔ 📛 🚫 💯 💢 ♨️ 🚷 🚯 🚳 🚱 🔞 📵 🚭 ❗ ❕ ❓ ❔ ‼️ ⁉️ 🔅 🔆 〽️ ⚠️ 🚸 🔱 ⚜️ 🔰 ♻️ ✅ 🈯 💹 ❇️ ✳️ ❎ 🌐 💠 Ⓜ️ 🌀 💤 🏧 🚾 ♿ 🅿️ 🛗 🈳 🈂️ 🛂 🛃 🛄 🛅 🚹 🚺 🚼 ⚧️ 🚻 🚮 🎦 📶 🈁 🔣 ℹ️ 🔤 🔡 🔠 🆖 🆗 🆙 🆒 🆕 🆓 0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟 🔢 #️⃣ *️⃣ ⏏️ ▶️ ⏸️ ⏯️ ⏹️ ⏺️ ⏭️ ⏮️ ⏩ ⏪ ⏫ ⏬ ◀️ 🔼 🔽 ➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ ↙️ ↖️ ↕️ ↔️ ↪️ ↩️ ⤴️ ⤵️ 🔀 🔁 🔂 🔄 🔃 🎵 🎶 ➕ ➖ ➗ ✖️ 🟰 ♾️ 💲 💱 ™️ ©️ ®️ 👁️‍🗨️ 🔚 🔙 🔛 🔝 🔜 〰️ ➰ ➿ ✔️ ☑️ 🔘 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟤 🔺 🔻 🔸 🔹 🔶 🔷 🔳 🔲 ▪️ ▫️ ◾ ◽ ◼️ ◻️ 🟥 🟧 🟨 🟩 🟦 🟪 ⬛ ⬜ 🟫 🔈 🔇 🔉 🔊 🔔 🔕 📣 📢 💬 💭 🗯️ ♠️ ♣️ ♥️ ♦️ 🃏 🎴 🀄 🕐 🕑 🕒 🕓 🕔 🕕 🕖 🕗 🕘 🕙 🕚 🕛`),
  },
  {
    key: 'flags',
    icon: '🏳️',
    label: { ps: 'بیرغونه', en: 'Flags', fa: 'پرچم‌ها' },
    list: g(`🏳️ 🏴 🏁 🚩 🏳️‍🌈 🏴‍☠️ 🇦🇫 🇵🇰 🇮🇷 🇹🇯 🇺🇿 🇹🇲 🇨🇳 🇮🇳 🇹🇷 🇸🇦 🇦🇪 🇶🇦 🇰🇼 🇴🇲 🇮🇶 🇪🇬 🇺🇸 🇬🇧 🇩🇪 🇫🇷 🇮🇹 🇪🇸 🇨🇦 🇦🇺 🇯🇵 🇰🇷 🇷🇺 🇧🇷 🇦🇷 🇲🇽 🇳🇱 🇸🇪 🇳🇴 🇩🇰 🇫🇮 🇧🇪 🇨🇭 🇦🇹 🇵🇱 🇺🇦 🇬🇷 🇵🇹 🇮🇪 🇮🇩 🇲🇾 🇧🇩 🇱🇰 🇳🇵 🇦🇿 🇰🇿 🇯🇴 🇱🇧 🇸🇾 🇵🇸 🇲🇦 🇩🇿 🇹🇳 🇳🇬 🇿🇦 🇰🇪 🇪🇹`),
  },
];

/** A few search words (Pashto + English) for the most used emojis. */
const WORDS: Record<string, string> = {
  '❤️': 'heart love مینه زړه', '😂': 'laugh lol خندا', '😆': 'laugh haha خندا', '🤣': 'laugh rofl خندا', '😍': 'love eyes مینه',
  '🥰': 'love مینه', '😘': 'kiss مچ', '😢': 'cry sad ژړا خپه', '😭': 'cry sob ژړا', '😡': 'angry mad غوسه', '😠': 'angry غوسه',
  '😮': 'wow surprise حیران', '😱': 'scream fear وېره', '👍': 'like ok yes ښه هو', '👎': 'dislike no نه', '🙏': 'pray thanks please مننه دعا',
  '👏': 'clap applause چکچکې', '🔥': 'fire hot اور', '💯': 'hundred perfect سل', '🎉': 'party congrats مبارک', '😎': 'cool',
  '🤔': 'think فکر', '🙄': 'eyeroll', '😴': 'sleep خوب', '🤝': 'deal handshake لاس', '💪': 'strong muscle زور', '👋': 'hi hello bye سلام',
  '😊': 'smile happy خوښ', '🙂': 'smile', '😁': 'grin', '😅': 'sweat', '😉': 'wink', '🤗': 'hug غېږ', '🤩': 'star wow', '🥳': 'party',
  '😔': 'sad خپه', '💔': 'broken heart', '🌹': 'rose flower ګل', '🌸': 'flower ګل', '⭐': 'star ستوری', '✨': 'sparkles', '🕋': 'kaaba کعبه',
  '🕌': 'mosque جومات', '☪️': 'islam', '🤲': 'dua دعا', '👑': 'king crown پاچا', '🇦🇫': 'afghanistan افغانستان', '✅': 'done yes check',
  '❌': 'no wrong', '💀': 'dead skull', '🤡': 'clown', '🙈': 'monkey shy شرم', '☕': 'tea coffee چای', '🍵': 'tea چای', '⚽': 'football',
  '🏏': 'cricket کرکټ', '🎂': 'birthday cake کلیزه', '🎁': 'gift ډالۍ', '💐': 'flowers ګلونه', '😇': 'angel', '🤍': 'white heart',
};

export function searchEmojis(q: string): string[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const hits = Object.entries(WORDS).filter(([, w]) => w.toLowerCase().includes(s)).map(([e]) => e);
  return hits.length ? hits : EMOJI_GROUPS.filter((gr) => Object.values(gr.label).some((l) => l.toLowerCase().includes(s))).flatMap((gr) => gr.list).slice(0, 80);
}

const RECENT_KEY = 'fshow.recentEmojis';
export async function recentEmojis(): Promise<string[]> {
  try {
    const v = await AsyncStorage.getItem(RECENT_KEY);
    return v ? (JSON.parse(v) as string[]).slice(0, 24) : [];
  } catch {
    return [];
  }
}
export async function rememberEmoji(e: string) {
  try {
    const old = await recentEmojis();
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify([e, ...old.filter((x) => x !== e)].slice(0, 24)));
  } catch {
    /* not important */
  }
}
