export const supportedLocales = ['en', 'hinglish', 'hi'] as const;

export type AppLocale = (typeof supportedLocales)[number];

export const defaultLocale: AppLocale = 'en';

// Crisis-support resources — verified 2026-07-12. Names and numbers are
// intentionally identical across every locale (never translate a phone
// number or a language-coverage claim); only the surrounding copy in
// `safety.*` below is localized. Tele-MANAS is first/primary: government
// helpline, 24/7, broadest language coverage.
const safetyResources = [
  {
    id: 'tele-manas',
    name: 'Tele-MANAS',
    detail: '24/7 · 20+ Indian languages',
    phones: [
      { display: '14416', href: 'tel:14416' },
      { display: '1-800-891-4416', href: 'tel:18008914416' },
    ],
  },
  {
    id: 'vandrevala',
    name: 'Vandrevala Foundation',
    detail: 'Call or WhatsApp · 24/7',
    phones: [{ display: '9999 666 555', href: 'tel:9999666555' }],
  },
  {
    id: 'aasra',
    name: 'AASRA',
    detail: '24/7',
    phones: [{ display: '022-27546669', href: 'tel:02227546669' }],
  },
  {
    id: 'outside-india',
    name: 'Outside India',
    detail: 'Find a local helpline',
    phones: [{ display: 'findahelpline.com', href: 'https://findahelpline.com' }],
  },
] as const;

const en = {
  common: {
    actions: {
      backToHome: 'Back to home',
      cancel: 'Cancel',
      continue: 'Continue',
      delete: 'Delete',
      edit: 'Edit',
      forget: 'Forget',
      keepIt: 'Keep it',
      maybeLater: 'Maybe later',
      notNow: 'Not now',
      okay: 'Okay',
      save: 'Save',
      signIn: 'Sign in',
      signOut: 'Sign out',
      skip: 'Skip',
      startTalking: 'Start talking',
      talkAgain: 'Talk again',
      tryAgain: 'Try again',
    },
    status: {
      oneMoment: 'One moment…',
      saving: 'Saving…',
      saved: 'Saved',
      couldNotSave: 'Couldn’t save',
    },
  },
  auth: {
    signInLabel: 'Sign in',
    signUpLabel: 'Create account',
    signInHeading: 'Come back in.',
    signUpHeading: 'Keep your time.',
    signInSubcopy:
      'Sign in to keep your time, memories, and conversations together.',
    signUpSubcopy:
      'Create an account to keep your minutes and what you choose to remember.',
    fallback: 'One moment… setting up {mode}.',
  },
  splash: {
    profileLabel: 'Profile',
    startTalkingLabel: 'Start talking',
    tapToTalk: 'Tap to talk',
    privacy: 'Private. Just between us.',
  },
  topNav: {
    homeLabel: '{brandName} home',
    profileLabel: 'Profile',
    signIn: 'Sign in',
  },
  transcript: {
    assistantSpeaker: 'me',
    userSpeaker: 'you',
  },
  // Shown when /api/session/start soft-gates on the operator's usage
  // limits (daily cap or IP throttle) — see lib/limits.ts. Calm, no
  // pressure: there is nothing to buy, the caller just comes back later.
  rateLimit: {
    headline: 'That’s today’s limit.',
    subtext: 'Come back tomorrow — I’ll be here.',
  },
  onboarding: {
    nameTitle: 'What should I call you?',
    nameTitlePrefix: 'What should I',
    nameTitleEmphasis: 'call you',
    nameHelp: 'First name, nickname, anything you like.',
    namePlaceholder: 'Type a name',
    saveError: 'Something went quiet. Try again?',
    helper: 'You can change this anytime.',
    safetyNote: 'An AI companion, not a replacement for professional support.',
    languages: [
      {
        id: 'hinglish',
        label: 'Hinglish',
        sub: 'English + Hindi, naturally',
      },
      { id: 'english', label: 'English', sub: 'mostly English' },
      { id: 'hindi', label: 'Hindi', sub: 'Hindi-first' },
    ],
  },
  preferences: {
    makeThisYours: 'Make this yours.',
    theme: 'Theme',
    identity: 'Identity',
    name: 'Name',
    namePlaceholder: 'What should I call you?',
    language: 'Language',
    conversation: 'Conversation',
    themes: {
      blue: 'Midnight blue',
      rose: 'Magenta dusk',
      purple: 'Deep purple',
      amber: 'Warm amber',
    },
    languages: {
      hinglish: 'Hinglish',
      english: 'English',
      hindi: 'Hindi',
    },
  },
  conversation: {
    ariaLabel: 'Luna call',
    titleSuffix: 'here with you',
    freeSession: 'free session',
    starterLinesLabel: 'Starter lines',
    starterIntro: 'If words feel hard, try saying',
    suggested: [
      '"I had a weird day"',
      '"Can we just sit quietly?"',
      '"I miss someone"',
      '"Tell me a story"',
    ],
    mute: 'Mute',
    unmute: 'Unmute',
    endCall: 'End call',
    conflict: {
      headline: 'Your last call is still closing.',
      primary: 'Start a new call',
      secondary: 'Not now',
    },
    micError: {
      deniedHeadline: 'I need your mic to talk. Try again?',
      blockedHeadline: 'Microphone is blocked in your browser settings.',
      enableMic: 'How to enable mic',
    },
    state: {
      ended: 'session ended',
      speaking: 'speaking…',
      assistantSpeaking: 'speaking…',
      listening: 'listening…',
      userSpeaking: 'listening…',
      thinking: 'thinking…',
      connecting: 'getting ready…',
      ready: 'I’m here',
      idle: 'I’m here',
    },
    rateLimited: {
      headline: 'That’s today’s limit.',
      subtext: 'Come back tomorrow — I’ll be here.',
    },
    sessionEnd: {
      ariaLabel: 'Session with {botName} ended',
      rememberName: "{remember}, {name}.",
      defaultName: 'you',
      stats: {
        talked: 'Talked',
        private: 'Private',
        privateValue: 'yes',
        memory: 'Memory',
        memoryValue: 'on',
      },
      farewell: {
        morning: {
          heading: ['“I liked talking', 'to you this morning.”'],
          remember: "I'll remember this for next time",
          closer: 'Have a good day.',
          bye: 'Take care',
        },
        afternoon: {
          heading: ['“I liked talking', 'to you today.”'],
          remember: "I'll remember this for next time",
          closer: 'Catch you later.',
          bye: 'See you',
        },
        evening: {
          heading: ['“I liked talking', 'to you tonight.”'],
          remember: "I'll remember this for next time",
          closer: 'Enjoy your evening.',
          bye: 'Goodnight',
        },
        lateNight: {
          heading: ['“I liked talking', 'to you tonight.”'],
          remember: "I'll remember this for next time",
          closer: 'Sleep well.',
          bye: 'Goodnight',
        },
      },
    },
  },
  profile: {
    lifetimeTogether: 'We’ve spent {minutes} minutes together',
    greeting: 'Hey, {firstName}.',
    greetingPrefix: 'Hey,',
    greetingSubcopy: 'It’s good to see you again.',
    prompts: {
      morning: 'How are you feeling today?',
      afternoon: 'How’s your day going?',
      evening: 'How was your day?',
      night: 'What’s on your mind tonight?',
      lateNight: 'Still here with the quiet?',
    },
    memoryLane: {
      eyebrow: 'Memory lane',
      none: 'Nothing saved yet.',
      one: '1 conversation saved gently.',
      many: '{count} conversations saved gently.',
      emptySubcopy: 'When you’re ready, start with one small thought.',
      hasItemsSubcopy: 'Scroll through every moment we’ve shared.',
    },
    preferences: {
      title: 'Preferences',
      hint: 'Name and language',
    },
    account: {
      title: 'Account',
      conversationsSoFar: '{count} conversation{plural} so far',
    },
    remembered: {
      mentioned: 'You mentioned {topic}',
      unresolved: 'Still on your mind: {topic}',
      mood: "Lately you've felt {mood}",
    },
  },
  memoryStrip: {
    title: 'A few things I remember…',
    subcopy: 'Private. You can change this anytime.',
    editLabel: 'Edit: {text}',
    forgetLabel: 'Forget: {text}',
    forgetTitle: 'Forget this memory?',
    forgetSubcopy: 'You can always tell me again later.',
    editTitle: 'Reword this memory',
    editSubcopy: 'How would you like me to remember it?',
    editInputLabel: 'Edited memory text',
  },
  memoryLane: {
    back: '← Back',
    title: 'Memory lane',
    subcopy: 'Moments from our conversations, kept softly.',
    whisper: 'Scroll through what we’ve shared.',
    emptyTitle: 'No memories yet.',
    emptySubcopy: 'When you’re ready, start with one small thought.',
    searchPlaceholder: 'Search memories… try “sleep” or “work”',
    searchLabel: 'Search memories',
    noResultsTitle: 'Nothing came up.',
    noResultsSubcopy: 'Try a name, feeling, or something we talked about.',
    loading: 'Finding older memories…',
    end: 'That’s where it all started.',
    durationLessThanMinute: 'less than a minute',
    durationOneMinute: '1 min',
    durationMinutes: '{minutes} min',
    relativeToday: 'today, {time}',
    relativeYesterday: 'yesterday, {time}',
    groups: {
      today: 'Today',
      yesterday: 'Yesterday',
      thisWeek: 'Earlier this week',
      lastWeek: 'Last week',
      earlier: 'Earlier',
    },
  },
  sessionActions: {
    deleteConversation: 'Delete conversation',
    deleteTitle: 'Delete this conversation?',
    deleteSubcopy: 'This removes it from your history.',
    deleteError: 'Couldn’t delete just now. Try again?',
    deleting: 'Deleting…',
  },
  sessionDetail: {
    back: '← Back',
    summaryTitle: 'What we talked about',
    keyMomentTitle: 'A moment from this conversation',
    recordingTitle: 'Recording',
    conversationTitle: 'Conversation',
    noTranscript: 'We didn’t save the words from this conversation.',
    privacy: 'Private. You can delete this anytime.',
    transcriptUser: 'you',
    transcriptAssistant: 'them',
    summary: {
      themeAndMood:
        'You talked a little about {theme}, and were feeling {mood}.',
      theme: 'You talked a little about {theme}.',
      mood: 'You were feeling {mood} when we talked.',
      short: 'This was a short conversation.',
      empty: 'We didn’t talk long enough to make a clear summary.',
    },
    keyMoment: {
      unresolved: 'You mentioned {topic}.',
      person: 'You brought up {person}.',
    },
  },
  // In-call safety banner (triggered by the bot's real-time risk signal)
  // and the public /safety page. Copy here may use plain factual terms
  // ("therapist", "crisis", "professional support") that DESIGN.md §2
  // otherwise bans as clinical language — approved exception: safety
  // clarity beats vibe on this one surface. Still calm, still plain,
  // never dramatized.
  safety: {
    bannerLede: 'If things feel heavy right now, here’s some real support:',
    dismiss: 'Close',
    chipLabel: 'Support',
    linkLabel: 'Safety & data',
    resources: safetyResources,
    page: {
      title: 'Safety & data',
      back: '← Back',
      whatHeading: 'What this is',
      whatBody:
        '{brandName} is an AI companion for conversation — someone to talk to, especially late at night. It listens, and remembers what you choose to share, so conversations can pick up where they left off.',
      whatNotHeading: 'What this isn’t',
      whatNotBody:
        '{brandName} isn’t a therapist, and it isn’t a replacement for professional support. It can’t respond to emergencies. If you’re in immediate danger, please contact local emergency services or go to the nearest hospital.',
      supportHeading: 'If you need support now',
      supportIntro: 'These are real people, free to reach, day or night.',
      dataHeading: 'How your information is handled',
      dataIntro: 'In plain terms:',
      dataBullets: [
        {
          label: 'What’s kept',
          body: 'the basics of your account, the transcript of what’s said in your conversations, and a short AI-written reflection after each call that helps {brandName} remember context next time. If whoever runs this app has turned on voice recording, calls may be recorded too.',
        },
        {
          label: 'Where',
          body: 'it all lives in the database the operator of this app manages themselves — not a shared service run by us. Recordings, only if turned on, sit in the operator’s own storage.',
        },
        {
          label: 'In the moment',
          body: 'if a conversation shows signs you might be in crisis, {brandName} is designed to gently point toward the resources above and give the call more time. That detection itself isn’t stored or logged — though, like the rest of the call, what you say is still saved as a normal transcript.',
        },
        {
          label: 'The after-call reflection',
          body: 'writing that short summary uses the AI provider the operator has configured — your conversation is sent there briefly to write it.',
        },
        {
          label: 'Deleting',
          body: 'you can delete any single conversation, any time, from Memory lane — that removes its transcript and reflection for good. Editing or “forgetting” a memory line on your profile only hides it on this device for now; it doesn’t erase the underlying record yet. There’s no self-serve way to delete your whole account yet — ask whoever runs this instance if you want that.',
        },
      ],
    },
  },
} as const;

type WidenCopy<T> = T extends 'english' | 'hinglish' | 'hindi'
  ? T
  : T extends string
    ? string
    : T extends readonly (infer U)[]
      ? readonly WidenCopy<U>[]
      : T extends object
        ? { readonly [K in keyof T]: WidenCopy<T[K]> }
        : T;

export type AppCopy = WidenCopy<typeof en>;

const hinglish: AppCopy = {
  ...en,
  common: {
    actions: {
      ...en.common.actions,
      backToHome: 'Home par wapas',
      cancel: 'Cancel',
      continue: 'Continue',
      delete: 'Delete',
      edit: 'Edit',
      forget: 'Bhool jao',
      keepIt: 'Rehne do',
      maybeLater: 'Baad mein',
      notNow: 'Abhi nahi',
      okay: 'Okay',
      save: 'Save',
      signIn: 'Sign in',
      signOut: 'Sign out',
      skip: 'Skip',
      startTalking: 'Talk shuru karo',
      talkAgain: 'Phir baat karein',
      tryAgain: 'Phir try karo',
    },
    status: {
      oneMoment: 'Ek second…',
      saving: 'Save ho raha hai…',
      saved: 'Saved',
      couldNotSave: 'Save nahi hua',
    },
  },
  auth: {
    ...en.auth,
    signInHeading: 'Wapas aa jao.',
    signUpHeading: 'Apna time save karo.',
    signInSubcopy:
      'Sign in karo taaki tumhara time, memories, aur conversations saath rahen.',
    signUpSubcopy:
      'Account banao taaki minutes aur jo tum yaad rakhwana chaho, safe rahe.',
    fallback: 'Ek second… {mode} set ho raha hai.',
  },
  splash: {
    profileLabel: 'Profile',
    startTalkingLabel: 'Talk shuru karo',
    tapToTalk: 'Baat karne ke liye tap karo',
    privacy: 'Private. Sirf humare beech.',
  },
  topNav: {
    ...en.topNav,
    signIn: 'Sign in',
  },
  transcript: {
    assistantSpeaker: 'main',
    userSpeaker: 'tum',
  },
  rateLimit: {
    headline: 'Aaj ka time ho gaya.',
    subtext: 'Kal phir baat karte hain — main yahin hoongi.',
  },
  onboarding: {
    ...en.onboarding,
    nameTitle: 'Main tumhe kya bulaun?',
    nameTitlePrefix: 'Main tumhe kya',
    nameTitleEmphasis: 'bulaun',
    nameHelp: 'First name, nickname, jo tumhe theek lage.',
    namePlaceholder: 'Naam likho',
    saveError: 'Kuch gadbad ho gayi. Phir try karein?',
    helper: 'Ye baad mein change kar sakte ho.',
    safetyNote: 'Ek AI companion, professional support ka replacement nahi.',
    languages: [
      {
        id: 'hinglish',
        label: 'Hinglish',
        sub: 'English + Hindi, naturally',
      },
      { id: 'english', label: 'English', sub: 'mostly English' },
      { id: 'hindi', label: 'Hindi', sub: 'Hindi-first' },
    ],
  },
  preferences: {
    ...en.preferences,
    makeThisYours: 'Isse apna bana lo.',
    theme: 'Theme',
    identity: 'Identity',
    name: 'Name',
    namePlaceholder: 'Main tumhe kya bulaun?',
    language: 'Language',
    conversation: 'Conversation',
  },
  conversation: {
    ...en.conversation,
    titleSuffix: 'tumhare saath',
    freeSession: 'free session',
    starterIntro: 'Words mushkil lag rahe hain toh yeh bolo',
    suggested: [
      '"Aaj din ajeeb tha"',
      '"Bas thodi der chup baith sakte hain?"',
      '"Kisi ki yaad aa rahi hai"',
      '"Mujhe ek kahani sunao"',
    ],
    mute: 'Mute',
    unmute: 'Unmute',
    endCall: 'Call end karo',
    conflict: {
      headline: 'Tumhari last call abhi close ho rahi hai.',
      primary: 'Nayi call shuru karo',
      secondary: 'Abhi nahi',
    },
    micError: {
      deniedHeadline: 'Baat karne ke liye mic chahiye. Phir try karein?',
      blockedHeadline: 'Browser settings mein microphone blocked hai.',
      enableMic: 'Mic enable kaise karein',
    },
    state: {
      ended: 'session end ho gaya',
      speaking: 'bol rahi hoon…',
      assistantSpeaking: 'bol rahi hoon…',
      listening: 'sun rahi hoon…',
      userSpeaking: 'sun rahi hoon…',
      thinking: 'samajh rahi hoon…',
      connecting: 'ready ho rahi hoon…',
      ready: 'Main yahin hoon',
      idle: 'Main yahin hoon',
    },
    rateLimited: {
      headline: 'Aaj ka time ho gaya.',
      subtext: 'Kal phir baat karte hain — main yahin hoongi.',
    },
    sessionEnd: {
      ...en.conversation.sessionEnd,
      ariaLabel: '{botName} ke saath session end hua',
      rememberName: '{remember}, {name}.',
      defaultName: 'tum',
      farewell: {
        morning: {
          heading: ['“Subah tumse baat karke', 'achha laga.”'],
          remember: 'Agli baar ke liye yaad rakhungi',
          closer: 'Aaj ka din achha ho.',
          bye: 'Take care',
        },
        afternoon: {
          heading: ['“Aaj tumse baat karke', 'achha laga.”'],
          remember: 'Agli baar ke liye yaad rakhungi',
          closer: 'Phir milte hain.',
          bye: 'See you',
        },
        evening: {
          heading: ['“Aaj raat tumse baat karke', 'achha laga.”'],
          remember: 'Agli baar ke liye yaad rakhungi',
          closer: 'Shaam aaram se guzre.',
          bye: 'Goodnight',
        },
        lateNight: {
          heading: ['“Aaj raat tumse baat karke', 'achha laga.”'],
          remember: 'Agli baar ke liye yaad rakhungi',
          closer: 'Aaram se sona.',
          bye: 'Goodnight',
        },
      },
    },
  },
  profile: {
    ...en.profile,
    lifetimeTogether: 'Humne {minutes} minutes saath bitaye hain',
    greetingPrefix: 'Hey,',
    greetingSubcopy: 'Tumhe phir dekh kar achha laga.',
    prompts: {
      morning: 'Aaj kaisa feel ho raha hai?',
      afternoon: 'Din kaisa chal raha hai?',
      evening: 'Aaj ka din kaisa tha?',
      night: 'Aaj raat dimaag mein kya hai?',
      lateNight: 'Abhi bhi quiet ke saath ho?',
    },
    memoryLane: {
      eyebrow: 'Memory lane',
      none: 'Abhi kuch save nahi hua.',
      one: '1 conversation gently saved hai.',
      many: '{count} conversations gently saved hain.',
      emptySubcopy: 'Jab ready ho, ek chhoti si baat se shuru karo.',
      hasItemsSubcopy: 'Jo moments humne share kiye, unhe dekh lo.',
    },
    preferences: {
      title: 'Preferences',
      hint: 'Name aur language',
    },
    account: {
      title: 'Account',
      conversationsSoFar: 'Ab tak {count} conversation{plural}',
    },
    remembered: {
      mentioned: 'Tumne {topic} mention kiya tha',
      unresolved: 'Abhi bhi dimaag mein: {topic}',
      mood: 'Lately tum {mood} feel kar rahe the',
    },
  },
  memoryStrip: {
    ...en.memoryStrip,
    title: 'Kuch baatein jo mujhe yaad hain…',
    subcopy: 'Private. Tum ise kabhi bhi change kar sakte ho.',
    editLabel: 'Edit: {text}',
    forgetLabel: 'Bhool jao: {text}',
    forgetTitle: 'Ye memory bhool jaun?',
    forgetSubcopy: 'Tum mujhe baad mein phir bata sakte ho.',
    editTitle: 'Is memory ko reword karo',
    editSubcopy: 'Tum chahte ho main ise kaise yaad rakhun?',
    editInputLabel: 'Edited memory text',
  },
  memoryLane: {
    ...en.memoryLane,
    back: '← Back',
    title: 'Memory lane',
    subcopy: 'Hamari conversations ke moments, gently saved.',
    whisper: 'Jo humne share kiya, unhe dekh lo.',
    emptyTitle: 'Abhi memories nahi hain.',
    emptySubcopy: 'Jab ready ho, ek chhoti si baat se shuru karo.',
    searchPlaceholder: 'Memories search karo… “sleep” ya “work” likho',
    searchLabel: 'Memories search',
    noResultsTitle: 'Kuch nahi mila.',
    noResultsSubcopy: 'Koi naam, feeling, ya baat try karo.',
    loading: 'Purani memories dhoondh rahi hoon…',
    end: 'Yahin se sab shuru hua tha.',
    durationLessThanMinute: 'ek minute se kam',
    relativeToday: 'aaj, {time}',
    relativeYesterday: 'kal, {time}',
    groups: {
      today: 'Aaj',
      yesterday: 'Kal',
      thisWeek: 'Is hafte pehle',
      lastWeek: 'Pichhle hafte',
      earlier: 'Pehle',
    },
  },
  sessionActions: {
    deleteConversation: 'Conversation delete karo',
    deleteTitle: 'Ye conversation delete karni hai?',
    deleteSubcopy: 'Ye tumhari history se remove ho jayegi.',
    deleteError: 'Abhi delete nahi hua. Phir try karein?',
    deleting: 'Delete ho raha hai…',
  },
  sessionDetail: {
    ...en.sessionDetail,
    summaryTitle: 'Humne kya baat ki',
    keyMomentTitle: 'Is conversation ka ek moment',
    recordingTitle: 'Recording',
    conversationTitle: 'Conversation',
    noTranscript: 'Is conversation ke words save nahi hue.',
    privacy: 'Private. Tum ise kabhi bhi delete kar sakte ho.',
    transcriptUser: 'tum',
    transcriptAssistant: 'woh',
    summary: {
      themeAndMood:
        'Tumne thoda {theme} ke baare mein baat ki, aur {mood} feel kar rahe the.',
      theme: 'Tumne thoda {theme} ke baare mein baat ki.',
      mood: 'Jab humne baat ki, tum {mood} feel kar rahe the.',
      short: 'Ye ek chhoti conversation thi.',
      empty: 'Summary banane ke liye humne zyada der baat nahi ki.',
    },
    keyMoment: {
      unresolved: 'Tumne {topic} mention kiya.',
      person: 'Tumne {person} ka zikr kiya.',
    },
  },
  safety: {
    bannerLede: 'Agar abhi sab kuch heavy lag raha hai, toh yeh real support hai:',
    dismiss: 'Close',
    chipLabel: 'Support',
    linkLabel: 'Safety & data',
    resources: safetyResources,
    page: {
      title: 'Safety & data',
      back: '← Back',
      whatHeading: 'Yeh kya hai',
      whatBody:
        '{brandName} baat karne ke liye ek AI companion hai — khaaskar raat mein. Yeh sunta hai, aur jo tum share karo woh yaad rakhta hai, taaki agli baar baat wahi se shuru ho.',
      whatNotHeading: 'Yeh kya nahi hai',
      whatNotBody:
        '{brandName} therapist nahi hai, aur professional support ka replacement nahi hai. Yeh emergency mein respond nahi kar sakta. Agar tum turant khatre mein ho, please local emergency services ko contact karo ya nearest hospital jao.',
      supportHeading: 'Agar abhi support chahiye',
      supportIntro: 'Yeh real log hain, din ho ya raat, free mein available.',
      dataHeading: 'Tumhari information kaise handle hoti hai',
      dataIntro: 'Seedhe shabdon mein:',
      dataBullets: [
        {
          label: 'Kya save hota hai',
          body: 'tumhare account ki basic details, tumhari conversations ka transcript, aur har call ke baad ek chhoti AI-likhi reflection jo {brandName} ko agli baar context yaad rakhne mein madad karti hai. Agar is app ko chalane wale ne voice recording on ki hai, toh calls record bhi ho sakti hain.',
        },
        {
          label: 'Kahaan',
          body: 'sab kuch us database mein rehta hai jise is app ka operator khud manage karta hai — humari koi shared service nahi. Recordings, agar on hain, operator ke apne storage mein rehti hain.',
        },
        {
          label: 'Us waqt',
          body: 'agar conversation mein crisis ke signs dikhte hain, toh {brandName} resources ki taraf gently point karne aur call ko thoda aur time dene ke liye design kiya gaya hai. Yeh detection khud kahin save ya log nahi hoti — lekin, baaki call ki tarah, tumne jo bola woh transcript mein save rehta hai.',
        },
        {
          label: 'After-call reflection',
          body: 'yeh chhota summary likhne ke liye operator ne jo AI provider configure kiya hai, wahi use hota hai — tumhari conversation thodi der ke liye wahan bheji jaati hai.',
        },
        {
          label: 'Delete karna',
          body: 'tum koi bhi ek conversation, kabhi bhi, Memory lane se delete kar sakte ho — isse uska transcript aur reflection hamesha ke liye chala jaata hai. Profile par kisi memory line ko edit ya “bhool jao” karna abhi sirf is device par hide karta hai; underlying record delete nahi karta. Poora account delete karne ka abhi koi self-serve tareeka nahi hai — agar chahiye toh is instance chalane wale se poocho.',
        },
      ],
    },
  },
};

const hi: AppCopy = {
  ...en,
  common: {
    actions: {
      ...en.common.actions,
      backToHome: 'होम पर वापस',
      cancel: 'रद्द करें',
      continue: 'जारी रखें',
      delete: 'हटाएं',
      edit: 'बदलें',
      forget: 'भूल जाएं',
      keepIt: 'रहने दें',
      maybeLater: 'बाद में',
      notNow: 'अभी नहीं',
      okay: 'ठीक है',
      save: 'सेव करें',
      signIn: 'साइन इन',
      signOut: 'साइन आउट',
      skip: 'छोड़ें',
      startTalking: 'बात शुरू करें',
      talkAgain: 'फिर बात करें',
      tryAgain: 'फिर कोशिश करें',
    },
    status: {
      oneMoment: 'एक पल…',
      saving: 'सेव हो रहा है…',
      saved: 'सेव हो गया',
      couldNotSave: 'सेव नहीं हो पाया',
    },
  },
  auth: {
    ...en.auth,
    signInLabel: 'साइन इन',
    signUpLabel: 'अकाउंट बनाएं',
    signInHeading: 'वापस आइए.',
    signUpHeading: 'अपना समय सुरक्षित रखें.',
    signInSubcopy:
      'अपना समय, यादें और बातचीत साथ रखने के लिए साइन इन करें.',
    signUpSubcopy:
      'अपने मिनट और जो बातें आप याद रखवाना चाहें, उन्हें सुरक्षित रखने के लिए अकाउंट बनाएं.',
    fallback: 'एक पल… {mode} सेट हो रहा है.',
  },
  splash: {
    profileLabel: 'प्रोफाइल',
    startTalkingLabel: 'बात शुरू करें',
    tapToTalk: 'बात करने के लिए टैप करें',
    privacy: 'निजी. सिर्फ हमारे बीच.',
  },
  topNav: {
    ...en.topNav,
    profileLabel: 'प्रोफाइल',
    signIn: 'साइन इन',
  },
  transcript: {
    assistantSpeaker: 'मैं',
    userSpeaker: 'आप',
  },
  rateLimit: {
    headline: 'आज के लिए समय खत्म.',
    subtext: 'कल फिर बात करते हैं — मैं यहीं रहूंगी.',
  },
  onboarding: {
    ...en.onboarding,
    nameTitle: 'मैं आपको क्या बुलाऊं?',
    nameTitlePrefix: 'मैं आपको क्या',
    nameTitleEmphasis: 'बुलाऊं',
    nameHelp: 'पहला नाम, nickname, जो आपको ठीक लगे.',
    namePlaceholder: 'नाम लिखें',
    saveError: 'कुछ गड़बड़ हो गई. फिर कोशिश करें?',
    helper: 'आप इसे बाद में बदल सकते हैं.',
    safetyNote: 'एक AI साथी, professional support का विकल्प नहीं.',
    languages: [
      {
        id: 'hinglish',
        label: 'हिंग्लिश',
        sub: 'English + Hindi, naturally',
      },
      { id: 'english', label: 'अंग्रेज़ी', sub: 'mostly English' },
      { id: 'hindi', label: 'हिंदी', sub: 'Hindi-first' },
    ],
  },
  preferences: {
    ...en.preferences,
    makeThisYours: 'इसे अपना बना लें.',
    theme: 'थीम',
    identity: 'पहचान',
    name: 'नाम',
    namePlaceholder: 'मैं आपको क्या बुलाऊं?',
    language: 'भाषा',
    conversation: 'बातचीत',
    languages: {
      hinglish: 'हिंग्लिश',
      english: 'अंग्रेज़ी',
      hindi: 'हिंदी',
    },
  },
  conversation: {
    ...en.conversation,
    ariaLabel: 'Luna कॉल',
    titleSuffix: 'आपके साथ',
    freeSession: 'free session',
    starterLinesLabel: 'शुरुआती बातें',
    starterIntro: 'अगर शब्द मुश्किल लगें, तो कहें',
    suggested: [
      '"आज दिन अजीब था"',
      '"क्या हम बस थोड़ी देर चुप बैठ सकते हैं?"',
      '"किसी की याद आ रही है"',
      '"मुझे एक कहानी सुनाओ"',
    ],
    mute: 'Mute',
    unmute: 'Unmute',
    endCall: 'कॉल खत्म करें',
    conflict: {
      headline: 'आपकी पिछली कॉल अभी बंद हो रही है.',
      primary: 'नई कॉल शुरू करें',
      secondary: 'अभी नहीं',
    },
    micError: {
      deniedHeadline: 'बात करने के लिए mic चाहिए. फिर कोशिश करें?',
      blockedHeadline: 'Browser settings में microphone blocked है.',
      enableMic: 'Mic enable कैसे करें',
    },
    state: {
      ended: 'session खत्म हो गया',
      speaking: 'बोल रही हूं…',
      assistantSpeaking: 'बोल रही हूं…',
      listening: 'सुन रही हूं…',
      userSpeaking: 'सुन रही हूं…',
      thinking: 'समझ रही हूं…',
      connecting: 'तैयार हो रही हूं…',
      ready: 'मैं यहीं हूं',
      idle: 'मैं यहीं हूं',
    },
    rateLimited: {
      headline: 'आज के लिए समय खत्म.',
      subtext: 'कल फिर बात करते हैं — मैं यहीं रहूंगी.',
    },
    sessionEnd: {
      ...en.conversation.sessionEnd,
      ariaLabel: '{botName} के साथ session खत्म हुआ',
      rememberName: '{remember}, {name}.',
      defaultName: 'आप',
      stats: {
        talked: 'बात हुई',
        private: 'निजी',
        privateValue: 'हां',
        memory: 'यादें',
        memoryValue: 'चालू',
      },
      farewell: {
        morning: {
          heading: ['“आज सुबह आपसे', 'बात करके अच्छा लगा.”'],
          remember: 'अगली बार के लिए याद रखूंगी',
          closer: 'आपका दिन अच्छा हो.',
          bye: 'ध्यान रखें',
        },
        afternoon: {
          heading: ['“आज आपसे', 'बात करके अच्छा लगा.”'],
          remember: 'अगली बार के लिए याद रखूंगी',
          closer: 'फिर मिलते हैं.',
          bye: 'फिर मिलेंगे',
        },
        evening: {
          heading: ['“आज रात आपसे', 'बात करके अच्छा लगा.”'],
          remember: 'अगली बार के लिए याद रखूंगी',
          closer: 'शाम आराम से गुजरे.',
          bye: 'शुभ रात्रि',
        },
        lateNight: {
          heading: ['“आज रात आपसे', 'बात करके अच्छा लगा.”'],
          remember: 'अगली बार के लिए याद रखूंगी',
          closer: 'आराम से सोइए.',
          bye: 'शुभ रात्रि',
        },
      },
    },
  },
  profile: {
    ...en.profile,
    lifetimeTogether: 'हमने {minutes} मिनट साथ बिताए हैं',
    greetingPrefix: 'नमस्ते,',
    greetingSubcopy: 'आपको फिर देखकर अच्छा लगा.',
    prompts: {
      morning: 'आज कैसा महसूस हो रहा है?',
      afternoon: 'आपका दिन कैसा चल रहा है?',
      evening: 'आज का दिन कैसा था?',
      night: 'आज रात मन में क्या है?',
      lateNight: 'अभी भी इस शांति के साथ हैं?',
    },
    memoryLane: {
      eyebrow: 'Memory lane',
      none: 'अभी कुछ save नहीं हुआ.',
      one: '1 conversation gently saved है.',
      many: '{count} conversations gently saved हैं.',
      emptySubcopy: 'जब तैयार हों, एक छोटी बात से शुरू करें.',
      hasItemsSubcopy: 'हमने जो moments share किए, उन्हें देख लें.',
    },
    preferences: {
      title: 'Preferences',
      hint: 'नाम और भाषा',
    },
    account: {
      title: 'Account',
      conversationsSoFar: 'अब तक {count} conversation{plural}',
    },
    remembered: {
      mentioned: 'आपने {topic} का जिक्र किया था',
      unresolved: 'अब भी मन में: {topic}',
      mood: 'हाल में आप {mood} महसूस कर रहे थे',
    },
  },
  memoryStrip: {
    ...en.memoryStrip,
    title: 'कुछ बातें जो मुझे याद हैं…',
    subcopy: 'निजी. आप इसे कभी भी बदल सकते हैं.',
    editLabel: 'बदलें: {text}',
    forgetLabel: 'भूल जाएं: {text}',
    forgetTitle: 'यह memory भूल जाऊं?',
    forgetSubcopy: 'आप मुझे बाद में फिर बता सकते हैं.',
    editTitle: 'इस memory को फिर से लिखें',
    editSubcopy: 'आप चाहते हैं मैं इसे कैसे याद रखूं?',
    editInputLabel: 'बदला हुआ memory text',
  },
  memoryLane: {
    ...en.memoryLane,
    back: '← वापस',
    title: 'Memory lane',
    subcopy: 'हमारी conversations के moments, gently saved.',
    whisper: 'जो हमने share किया, उसे देख लें.',
    emptyTitle: 'अभी memories नहीं हैं.',
    emptySubcopy: 'जब तैयार हों, एक छोटी बात से शुरू करें.',
    searchPlaceholder: 'Memories खोजें… “sleep” या “work” लिखें',
    searchLabel: 'Memories खोजें',
    noResultsTitle: 'कुछ नहीं मिला.',
    noResultsSubcopy: 'कोई नाम, feeling, या बात लिखकर देखें.',
    loading: 'पुरानी memories ढूंढ रही हूं…',
    end: 'यहीं से सब शुरू हुआ था.',
    durationLessThanMinute: 'एक मिनट से कम',
    durationOneMinute: '1 मिनट',
    durationMinutes: '{minutes} मिनट',
    relativeToday: 'आज, {time}',
    relativeYesterday: 'कल, {time}',
    groups: {
      today: 'आज',
      yesterday: 'कल',
      thisWeek: 'इस हफ्ते',
      lastWeek: 'पिछला हफ्ता',
      earlier: 'पहले',
    },
  },
  sessionActions: {
    deleteConversation: 'Conversation हटाएं',
    deleteTitle: 'यह conversation हटानी है?',
    deleteSubcopy: 'यह आपकी history से remove हो जाएगी.',
    deleteError: 'अभी delete नहीं हुआ. फिर कोशिश करें?',
    deleting: 'Delete हो रहा है…',
  },
  sessionDetail: {
    ...en.sessionDetail,
    back: '← वापस',
    summaryTitle: 'हमने क्या बात की',
    keyMomentTitle: 'इस conversation का एक पल',
    recordingTitle: 'Recording',
    conversationTitle: 'Conversation',
    noTranscript: 'इस conversation के words save नहीं हुए.',
    privacy: 'निजी. आप इसे कभी भी delete कर सकते हैं.',
    transcriptUser: 'आप',
    transcriptAssistant: 'वह',
    summary: {
      themeAndMood:
        'आपने थोड़ा {theme} के बारे में बात की, और {mood} महसूस कर रहे थे.',
      theme: 'आपने थोड़ा {theme} के बारे में बात की.',
      mood: 'जब हमने बात की, आप {mood} महसूस कर रहे थे.',
      short: 'यह एक छोटी conversation थी.',
      empty: 'Summary बनाने के लिए हमने ज्यादा देर बात नहीं की.',
    },
    keyMoment: {
      unresolved: 'आपने {topic} का जिक्र किया.',
      person: 'आपने {person} का जिक्र किया.',
    },
  },
  safety: {
    bannerLede: 'अगर अभी सब कुछ भारी लग रहा है, तो यह असली सहायता यहाँ है:',
    dismiss: 'बंद करें',
    chipLabel: 'सहायता',
    linkLabel: 'सुरक्षा और डेटा',
    resources: safetyResources,
    page: {
      title: 'सुरक्षा और डेटा',
      back: '← वापस',
      whatHeading: 'यह क्या है',
      whatBody:
        '{brandName} बात करने के लिए एक AI साथी है — खासकर रात में. यह सुनता है, और आप जो साझा करना चाहें वह याद रखता है, ताकि अगली बार बातचीत वहीं से शुरू हो सके.',
      whatNotHeading: 'यह क्या नहीं है',
      whatNotBody:
        '{brandName} थेरेपिस्ट नहीं है, और professional support का विकल्प नहीं है. यह इमरजेंसी में रिस्पॉन्ड नहीं कर सकता. अगर आप तुरंत खतरे में हैं, तो कृपया लोकल इमरजेंसी सेवाओं से संपर्क करें या नज़दीकी अस्पताल जाएं.',
      supportHeading: 'अगर अभी सहायता चाहिए',
      supportIntro: 'ये असली लोग हैं, दिन हो या रात, मुफ़्त में उपलब्ध.',
      dataHeading: 'आपकी जानकारी कैसे संभाली जाती है',
      dataIntro: 'सीधे शब्दों में:',
      dataBullets: [
        {
          label: 'क्या सेव होता है',
          body: 'आपके अकाउंट की बुनियादी जानकारी, आपकी बातचीत की transcript, और हर कॉल के बाद एक छोटी AI-लिखी reflection जो {brandName} को अगली बार context याद रखने में मदद करती है. अगर इस ऐप को चलाने वाले ने voice recording ऑन की है, तो कॉल्स रिकॉर्ड भी हो सकती हैं.',
        },
        {
          label: 'कहाँ',
          body: 'सब कुछ उस डेटाबेस में रहता है जिसे इस ऐप का operator खुद manage करता है — हमारी कोई shared सर्विस नहीं. Recordings, अगर ऑन हैं, operator के अपने storage में रहती हैं.',
        },
        {
          label: 'उस वक़्त',
          body: 'अगर बातचीत में crisis के संकेत दिखते हैं, तो {brandName} ऊपर दिए resources की तरफ़ धीरे से इशारा करने और कॉल को थोड़ा और समय देने के लिए बनाया गया है. यह पहचान खुद कहीं सेव या लॉग नहीं होती — लेकिन, बाकी कॉल की तरह, आपने जो कहा वह transcript में सेव रहता है.',
        },
        {
          label: 'कॉल के बाद की reflection',
          body: 'यह छोटा सारांश लिखने के लिए operator ने जो AI provider configure किया है, वही इस्तेमाल होता है — आपकी बातचीत थोड़ी देर के लिए वहाँ भेजी जाती है.',
        },
        {
          label: 'Delete करना',
          body: 'आप कोई भी एक बातचीत, कभी भी, Memory lane से delete कर सकते हैं — इससे उसकी transcript और reflection हमेशा के लिए चली जाती है. प्रोफाइल पर किसी memory line को edit या “भूल जाओ” करना अभी सिर्फ़ इस डिवाइस पर छुपाता है; असली record delete नहीं करता. पूरा अकाउंट delete करने का अभी कोई self-serve तरीका नहीं है — अगर चाहिए तो इस instance को चलाने वाले से पूछें.',
        },
      ],
    },
  },
};

export const appCopy = {
  en,
  hinglish,
  hi,
} satisfies Record<AppLocale, AppCopy>;

export function isAppLocale(locale: string | null | undefined): locale is AppLocale {
  return supportedLocales.includes(locale as AppLocale);
}

export function getAppCopy(locale: string | null | undefined = defaultLocale): AppCopy {
  return isAppLocale(locale) ? appCopy[locale] : appCopy[defaultLocale];
}

export function localeForLanguageMode(
  languageMode: string | null | undefined,
): AppLocale {
  if (languageMode === 'hinglish') return 'hinglish';
  if (languageMode === 'hindi') return 'hi';
  return 'en';
}

export function interpolate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = values[key];
    return value === undefined ? `{${key}}` : String(value);
  });
}
