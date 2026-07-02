/* =========================================================================
   Course content — standard (štokavian) Croatian, A1 → early A2.
   Sequenced by case frequency (N → A → L → G → D → I → V), gender taught on
   first appearance, aspect introduced early. Every item carries a source
   for the notes layer; a native-speaker review workflow exists in-app.

   Editorial principle: sentences follow patterns attested in the cited
   references (Easy Croatian, HJP examples, Croaticum/HR4EU sequencing);
   anything constructed is built strictly on those patterns and is exactly
   what the in-app flag → review workflow is for.
   ========================================================================= */
if (typeof window === 'undefined') { global.window = global; } // node test shim
(function () {
  'use strict';

  const SOURCES = {
    EC:   { label: 'Easy Croatian', detail: 'Daniel N., "Easy Croatian" — free online reference grammar of spoken and standard Croatian (easy-croatian.com).' },
    HJP:  { label: 'Hrvatski jezični portal', detail: 'HJP — the standard online dictionary of Croatian (hjp.znanje.hr), Znanje / Srce, University of Zagreb. "s.v." = see the entry for that word.' },
    ALX:  { label: 'Alexander (2006)', detail: 'Ronelle Alexander, "Bosnian, Croatian, Serbian: A Grammar with Sociolinguistic Commentary", University of Wisconsin Press, 2006.' },
    CROA: { label: 'Croaticum', detail: 'Croaticum — Centre for Croatian as a Second and Foreign Language, Faculty of Humanities and Social Sciences, University of Zagreb. A1 course sequencing.' },
    BHZ:  { label: 'Barić et al. (1997)', detail: 'Eugenija Barić et al., "Hrvatska gramatika", Školska knjiga, Zagreb, 1997 — the reference grammar of standard Croatian.' },
    PRAV: { label: 'Hrvatski pravopis', detail: 'Institut za hrvatski jezik i jezikoslovlje, "Hrvatski pravopis" (pravopis.hr) — the official orthography.' },
    HRW:  { label: 'hrWaC', detail: 'hrWaC — Croatian web corpus (1.9B tokens), Ljubešić & Klubička; used for frequency sanity-checks.' }
  };

  /* ---------------------------------------------------------------------
     GRAMMAR NOTES — the "rules" layer. Shown in lessons and the notes panel.
     --------------------------------------------------------------------- */
  const GRAMMAR = [
    {
      id: 'g-abeceda', unit: 1, title: 'Read it like you see it',
      body: 'Croatian spelling is predominantly phonemic: one letter (or digraph), one sound, almost always. The alphabet (gajica) has 30 letters — 27 single letters plus three digraphs counted as single letters: lj, nj, dž — including five with diacritics: č, ć, š, ž, đ. Once you know the sounds, you can read any Croatian word aloud correctly. This is why reading fluency comes fast.',
      source: 'PRAV §Slova (pravopis.hr/slova: 27 + 3 digraphs = 30); EC ch. 01 Alphabet and Pronunciation'
    },
    {
      id: 'g-izgovor', unit: 1, title: 'The special letters',
      body: 'č = "ch" in church (hard) · ć = softer "ch", tongue near the teeth · š = "sh" · ž = "s" in pleasure · đ = "j" in juice (soft) · dž = same but hard · lj = "lli" in million · nj = "ny" in canyon · j = "y" in yes · c = "ts" in cats · r can carry a syllable (Hrvatska, trg). Stress is never on the last syllable; for most early words it falls on the first.',
      source: 'ALX §1; EC ch. 01 Alphabet and Pronunciation'
    },
    {
      id: 'g-biti-sg', unit: 1, title: 'I am, you are — biti',
      body: 'The verb biti (to be), singular: ja sam (I am), ti si (you are), on/ona je (he/she is). The short forms sam/si/je are clitics — they cannot stand first in a sentence: "Dobro sam" (lit. "well am-I"). Subject pronouns are usually dropped because the verb already shows the person: "Sam" alone is wrong, but "Dobro sam" is perfect.',
      source: 'EC ch. 02; ALX §7'
    },
    {
      id: 'g-ti-vi', unit: 1, title: 'ti or Vi?',
      body: 'Croatian distinguishes informal ti (family, friends, children) from polite Vi (strangers, officials, older people). Vi takes plural verb forms: "Kako si?" to a friend, "Kako ste?" to a stranger. When in doubt with adults you don\'t know, use Vi.',
      source: 'ALX §2; CROA A1 syllabus (introduced in week 1)'
    },
    {
      id: 'g-rod', unit: 2, title: 'Every noun has a gender',
      body: 'Croatian nouns are masculine, feminine, or neuter — and the ending usually tells you which: consonant ending → masculine (brat, grad), -a → feminine (sestra, kava), -o or -e → neuter (jutro, more, dijete). Learn the gender with the noun, because adjectives, possessives and past-tense verbs all agree with it. Exceptions exist (kći, večer and obitelj are feminine; tata is masculine despite -a) — we flag them as they appear.',
      source: 'ALX §5; EC ch. 03 (gender of nouns); BHZ (imenice)'
    },
    {
      id: 'g-biti-pl', unit: 2, title: 'All of biti, and saying "not"',
      body: 'Present of biti: sam, si, je, smo, ste, su. These are clitics; when biti must stand first (questions, one-word answers) it has stressed forms: jesam, jesi, je… Negatives are fused words: nisam, nisi, nije, nismo, niste, nisu — "Nisam umoran" (I\'m not tired). Questions: "Jesi li…?" / "Je li…?"',
      source: 'EC ch. 02, ch. 26 Yes or No; ALX §7'
    },
    {
      id: 'g-posvojne', unit: 2, title: 'moj, moja, moje',
      body: 'Possessives agree with the gender of the thing possessed, not the owner: moj brat (m), moja sestra (f), moje ime (n). Same pattern for tvoj/tvoja/tvoje (your) and naš/naša/naše (our).',
      source: 'EC ch. 10 Possessives; ALX §11'
    },
    {
      id: 'g-vokativ', unit: 2, title: 'Calling someone: the vocative',
      body: 'Croatian has seven cases; the vocative is the one for addressing people directly — and the least used, so courses teach it last. Masculine names in a consonant take -e (Ivane!), velars shift (vojnik → vojniče!), soft consonants take -u (prijatelju!). Feminine nouns in -a traditionally take -o (ženo!, sestro!), but mama and tata stay unchanged, and with personal names modern usage increasingly keeps the nominative: Ana! You will mostly meet it in greetings and letters (Draga Ana…). We mention it here so the seven-case map is complete; the others come one at a time.',
      source: 'EC ch. 72 Addressing: Vocative Case; ALX §19; BHZ (vokativ)'
    },
    {
      id: 'g-akuzativ', unit: 3, title: 'Case #2 — accusative, the object case',
      body: 'The accusative marks the direct object — the thing you drink, eat, want, have. Endings (singular): feminine -a → -u (kava → kavu: "Pijem kavu"); masculine non-living and neuter look exactly like the dictionary form ("Jedem kruh"); masculine living beings take -a (brat → brata: "Imam brata"). This one case covers a huge share of everyday sentences, which is why it comes first after the nominative.',
      source: 'EC ch. 05 Accusative; ALX §21; CROA A1 syllabus (N then A within A1)'
    },
    {
      id: 'g-li', unit: 3, title: 'Yes/no questions with li',
      body: 'Put the verb first and li second: "Piješ li kavu?" (Do you drink coffee?). With biti: "Jesi li dobro?" Informal speech often just uses rising intonation, and "Je l\' …?" is everywhere in conversation, but li is the standard pattern.',
      source: 'EC ch. 26 Yes or No; ALX §8'
    },
    {
      id: 'g-negacija', unit: 3, title: 'Saying no: ne + verb',
      body: 'Negate by putting ne directly before the verb: "Ne pijem kavu." (I don\'t drink coffee.) It is written separately — except the fused forms of biti (nisam) and htjeti (neću).',
      source: 'EC ch. 09 Negation; PRAV (niječnica)'
    },
    {
      id: 'g-prezent', unit: 4, title: 'Three families of verbs',
      body: 'Croatian present tense has three patterns, named by the "you" ending: -a- verbs (gledati → gledam, gledaš, gleda, gledamo, gledate, gledaju), -i- verbs (govoriti → govorim, govoriš…), and -e- verbs (pisati → pišem, pišeš…; the -e- family often changes the stem, so learn the "I" form with the infinitive). Endings are utterly regular once you know the family: -m, -š, ∅, -mo, -te, -ju/-u/-e.',
      source: 'EC Essential Verbs (easy-croatian.com/p/verbs1.html); ALX & Elias-Bursać, BCS Textbook, Lesson 2 (a/e/i types)'
    },
    {
      id: 'g-vid', unit: 4, title: 'Aspect: two verbs for every action',
      body: 'Most Croatian actions come as a pair: an imperfective verb for ongoing/repeated action (piti — to be drinking, to drink habitually) and a perfective for a completed whole (popiti — to drink up, once). English hides this in tenses; Croatian builds it into the verb itself. Strategy: learn the imperfective first (it gives you the present tense), and attach its perfective partner — pairs in this course: piti/popiti, jesti/pojesti, čitati/pročitati, pisati/napisati, učiti/naučiti, kupovati/kupiti, davati/dati. Perfectives are mostly used in past and future: "Želim popiti kavu" (I want to drink (up) a coffee).',
      source: 'EC ch. 37 Complete Reading: Perfective Verbs; ALX §13 (aspect); HJP (paired entries)'
    },
    {
      id: 'g-lokativ', unit: 5, title: 'Case #3 — locative: where you are',
      body: 'After u (in) and na (on/at) for location, nouns take the locative. Singular endings: masculine and neuter → -u (Zagreb → u Zagrebu, more → na moru); feminine -a → -i (plaža → na plaži). Watch for sound changes before -i: -ka → -ci, -ga → -zi (knjiga → u knjizi, Amerika → u Americi). Country names in -ska decline like adjectives: Hrvatska → u Hrvatskoj. Good news: the dative (unit 9) has exactly the same endings — Croatian courses treat them as one merged "DL" case.',
      source: 'EC ch. 15 Locations (DL case); ALX §23; BHZ (lokativ)'
    },
    {
      id: 'g-smjer', unit: 5, title: 'Going vs. being: u/na + which case?',
      body: 'Direction (motion towards) takes the accusative; location (being there) takes the locative — with the same prepositions. "Idem u Zagreb" (going to → accusative) but "Živim u Zagrebu" (living in → locative). "Idemo na plažu" → "Mi smo na plaži." This direction/location switch is one of the most useful patterns in the language.',
      source: 'EC ch. 06 Destinations, ch. 15 Locations; ALX §23'
    },
    {
      id: 'g-genitiv', unit: 6, title: 'Case #4 — genitive: of, from, how much',
      body: 'The genitive marks possession and quantity: feminine -a → -e (voda → čaša vode, a glass of water), masculine/neuter → -a (vino → boca vina).\n\nIt follows koliko (how much), numbers, and prepositions like bez (without) and iz (from): "iz Zagreba".\n\nAfter 2, 3, 4 use the genitive singular (dva piva); after 5+ the genitive plural, which usually ends in -a (pet eura) — sometimes with an extra -a- slipped between final consonants (pjesma → pet pjesama).',
      source: 'EC ch. 20 Genitive, ch. 44 Genitive Plural; ALX §22; BHZ (genitiv)'
    },
    {
      id: 'g-brojevi', unit: 6, title: 'Numbers to 100',
      body: 'jedan, dva, tri, četiri, pet, šest, sedam, osam, devet, deset. Jedan agrees like an adjective (jedna kava, jedno pivo); dva has a feminine form dvije (dvije kave).\n\nTeens add -naest: jedanaest 11, dvanaest 12 … devetnaest 19 (note četrnaest 14 and šesnaest 16). Tens: dvadeset 20, trideset 30, četrdeset 40, pedeset 50, šezdeset 60, sedamdeset 70, osamdeset 80, devedeset 90, sto 100 — combine like English: dvadeset pet = 25.\n\nPrices are in euros since 1 January 2023; a number ending in jedan takes euro (dvadeset jedan euro), everything else eura (pet eura).',
      source: 'EC ch. 47 Numbers; ALX §12; HJP; euro adoption: official (HNB, 1 Jan 2023)'
    },
    {
      id: 'g-vrijeme-izrazi', unit: 7, title: 'Saying when',
      body: 'Days of the week take u + accusative: u ponedjeljak, u subotu. Parts of the day are adverbs: ujutro (in the morning), navečer (in the evening), danas/sutra/jučer (today/tomorrow/yesterday).\n\n"Koliko je sati?" = What time is it? — answer with numbers: "Pet je sati."',
      source: 'EC ch. 12 Simple Conversations (time); ALX §12'
    },
    {
      id: 'g-perfekt', unit: 8, title: 'The past tense (perfekt)',
      body: 'Past = present of biti + the l-participle, which agrees with the subject\'s gender: radio (m), radila (f), radilo (n); plural radili/radile. "Bio sam u Splitu" (said by a man), "Bila sam u Splitu" (by a woman). The clitic sam/si/je sits in second position: "Jučer sam radio." In questions: "Što si radio jučer?" One past tense covers nearly everything — Croatian conversation runs on the perfekt.',
      source: 'EC ch. 24 Past Tense; ALX §14'
    },
    {
      id: 'g-vid-proslost', unit: 8, title: 'Aspect does the work of English tenses',
      body: 'In the past, the pair carries the meaning: "Pio sam kavu" = I was drinking / used to drink coffee (imperfective); "Popio sam kavu" = I drank (up) the coffee, done (perfective). Pick the verb, not the tense.',
      source: 'EC ch. 24, ch. 37; ALX §13–14'
    },
    {
      id: 'g-dativ', unit: 9, title: 'Case #5 — dative: to whom',
      body: 'The dative marks the receiver: "Dajem mami poklon" (I give mum a present). You already know its endings — they are identical to the locative (-u m/n, -i f); Croatian courses treat the two as one merged "DL" case, so this one is free. The pronoun clitics mi (to me) and ti (to you) live in second position: "Možeš li mi pomoći?" (Can you help me? — pomoći takes the dative).',
      source: 'EC ch. 16 Giving to Someone (DL case); ALX (D and L formally identical for nouns)'
    },
    {
      id: 'g-instrumental', unit: 9, title: 'Case #6 — instrumental: with & by',
      body: 'Company takes s + instrumental: s prijateljem (with a friend), kava s mlijekom (coffee with milk). Means of transport takes the bare instrumental, no preposition: "Putujemo autobusom" (we travel by bus). Endings: -om (most), -em after soft consonants like j, š, ž, č (prijateljem).',
      source: 'EC ch. 35 Tools and Means, With and Without; ALX §24'
    },
    {
      id: 'g-futur', unit: 10, title: 'The future: ću + infinitive',
      body: 'Future = clitic forms of htjeti (ću, ćeš, će, ćemo, ćete, će) + infinitive: "Sutra ću raditi."\n\nIf the verb comes first, it joins the clitic — and a -ti infinitive drops its final i in spelling: "Kupit ću kruh" (never "kupiti ću"); -ći infinitives are unaffected: "Ići ću."\n\nQuestions use the stressed form: "Hoćeš li ići s nama?" (Will you go with us?)',
      source: 'EC ch. 40 Future Tense; ALX §15'
    },
    {
      id: 'g-red-rijeci', unit: 1, title: 'The second-position rule',
      body: 'Croatian little words — sam/si/je, ću/ćeš, se, mi/ti, ga/je — cluster in second position in the sentence, after the first stressed word: "Zovem se Ana" but "Moj muž se zove Marko."\n\nIf you remember one word-order rule, make it this one; it explains most of what feels strange at first.',
      source: 'ALX (clitic ordering); EC ch. 26, ch. 40 (second-position clitics)'
    },
    {
      id: 'g-dalmatinski', unit: 1, title: 'Dalmatian, beside the standard',
      body: 'Dalmatian forms are shown beside the standard wherever they differ. Three patterns cover most of it: (1) ikavian — standard ije/je becomes i: dijete → dite, lijep → lip, gdje → di; (2) coastal words from the Venetian centuries: baka → nona, trg → pjaca, sat → ura; (3) habits — final -m softens to -n (idem → iden, volim → volin) and infinitives drop the -i (raditi → radit).\n\nThe standard štokavian is the backbone — it is what is written and understood everywhere; the Dalmatian is what you will hear on the coast.\n\nIf a form looks wrong, flag it.',
      source: 'Dalmatian ikavian reflex & Adriatic-Romance lexicon (general); refine via the in-app flag workflow'
    }
  ];

  /* ---------------------------------------------------------------------
     WORDS — one SRS card each. g = gender (nouns), pf = perfective partner.
     pron = stressed-syllable approximation for an English reader.
     --------------------------------------------------------------------- */
  const W = (id, hr, en, pos, g, pron, unit, source, extra) =>
    Object.assign({ id, hr, en, pos, g, pron, unit, source }, extra || {});

  const WORDS = [
    /* ---- Unit 1 · Prvi koraci — first words ---- */
    W('bok', 'bok', 'hi / bye (informal)', 'phrase', null, 'BOK', 1, 'HJP s.v. bok; EC ch. 12 Simple Conversations', { note: 'The all-purpose Zagreb greeting, both hello and goodbye.' }),
    W('dobar-dan', 'dobar dan', 'good day / hello', 'phrase', null, 'DO-bar DAHN', 1, 'EC ch. 12 Simple Conversations; HJP s.v. dan', { note: 'dan is masculine — so dobar. The default daytime greeting to anyone.' }),
    W('dobro-jutro', 'dobro jutro', 'good morning', 'phrase', null, 'DO-bro YU-tro', 1, 'EC ch. 12 Simple Conversations; HJP s.v. jutro', { note: 'jutro is neuter — so dobro. Used until about 10 a.m.' }),
    W('dobra-vecer', 'dobra večer', 'good evening', 'phrase', null, 'DO-bra VEH-cher', 1, 'EC ch. 12 Simple Conversations; HJP s.v. večer', { note: 'večer is feminine — so dobra. The three greetings quietly teach all three genders.' }),
    W('laku-noc', 'laku noć', 'good night', 'phrase', null, 'LA-ku NOCH', 1, 'EC ch. 12 Simple Conversations; HJP s.v. noć', { note: 'Said only when parting for the night. noć is feminine.' }),
    W('dovidenja', 'doviđenja', 'goodbye', 'phrase', null, 'do-vi-JE-nya', 1, 'HJP s.v. doviđenja; PRAV', { note: 'Literally "until seeing". The đ is the soft j of "juice".' }),
    W('hvala', 'hvala', 'thank you', 'phrase', null, 'HVA-la', 1, 'HJP s.v. hvala', { note: '"Hvala lijepa" = thanks a lot. Reply: "Nema na čemu" or "Molim".' }),
    W('molim', 'molim', 'please / you\'re welcome / pardon?', 'phrase', null, 'MO-leem', 1, 'HJP s.v. moliti; EC ch. 12 Simple Conversations', { note: 'Three jobs in one word: please, you\'re welcome, and "say that again?"' }),
    W('da', 'da', 'yes', 'part', null, 'DA', 1, 'HJP s.v. da'),
    W('ne', 'ne', 'no / not', 'part', null, 'NE', 1, 'HJP s.v. ne', { note: 'Also negates verbs: ne razumijem = I don\'t understand.' }),
    W('oprostite', 'oprostite', 'excuse me / sorry (polite)', 'phrase', null, 'o-PROS-ti-te', 1, 'HJP s.v. oprostiti; EC ch. 12 Simple Conversations', { note: 'To a friend: oprosti. The -te is the polite/plural ending.' }),
    W('kako-si', 'Kako si?', 'How are you? (informal)', 'phrase', null, 'KA-ko see', 1, 'EC ch. 12 Simple Conversations; CROA A1', { note: 'Polite version: Kako ste? Standard answer: "Dobro sam, hvala."' }),
    W('dobro', 'dobro', 'well / fine / good', 'adv', null, 'DO-bro', 1, 'HJP s.v. dobro'),
    W('ja', 'ja', 'I', 'pron', null, 'YA', 1, 'ALX §7', { note: 'Usually dropped — the verb ending already says who. Use it for emphasis.' }),
    W('ti', 'ti', 'you (informal)', 'pron', null, 'TEE', 1, 'ALX §7'),
    W('ja-sam', 'ja sam', 'I am', 'phrase', null, 'ya SAM', 1, 'EC ch. 02 Simplest Sentences', { note: 'sam never stands first: "Dobro sam", never "Sam dobro".' }),
    W('drago-mi-je', 'Drago mi je.', 'Nice to meet you.', 'phrase', null, 'DRA-go mee ye', 1, 'EC ch. 12 Simple Conversations', { note: 'Literally "it is dear to me". Said while shaking hands.' }),
    W('i', 'i', 'and', 'conj', null, 'EE', 1, 'HJP s.v. i'),

    /* ---- Unit 2 · Obitelj — family & people ---- */
    W('mama', 'mama', 'mum', 'n', 'f', 'MA-ma', 2, 'HJP s.v. mama', { forms: { acc: 'mamu', dat: 'mami' } }),
    W('tata', 'tata', 'dad', 'n', 'm', 'TA-ta', 2, 'HJP s.v. tata', { note: 'Ends in -a but is masculine — it follows the person, not the ending.' }),
    W('brat', 'brat', 'brother', 'n', 'm', 'BRAT', 2, 'HJP s.v. brat', { forms: { acc: 'brata' }, note: 'Living masculine nouns take -a as object: "Imam brata."' }),
    W('sestra', 'sestra', 'sister', 'n', 'f', 'SES-tra', 2, 'HJP s.v. sestra', { forms: { acc: 'sestru' } }),
    W('sin', 'sin', 'son', 'n', 'm', 'SEEN', 2, 'HJP s.v. sin', { forms: { acc: 'sina' } }),
    W('kci', 'kći', 'daughter', 'n', 'f', 'K-CHEE', 2, 'HJP s.v. kći', { forms: { acc: 'kćer' }, note: 'Feminine despite not ending in -a; everyday speech often uses "kćer/ćerka".' }),
    W('muz', 'muž', 'husband', 'n', 'm', 'MUZH', 2, 'HJP s.v. muž', { forms: { acc: 'muža' } }),
    W('zena', 'žena', 'wife / woman', 'n', 'f', 'ZHE-na', 2, 'HJP s.v. žena', { forms: { acc: 'ženu' }, note: 'Context decides: moja žena = my wife; jedna žena = a woman.' }),
    W('dijete', 'dijete', 'child', 'n', 'n', 'dee-YE-te', 2, 'HJP s.v. dijete', { note: 'Neuter. Plural is irregular: djeca.' }),
    W('obitelj', 'obitelj', 'family', 'n', 'f', 'O-bi-tely', 2, 'HJP s.v. obitelj', { note: 'Feminine despite the consonant ending — like noć and večer.' }),
    W('baka', 'baka', 'grandmother', 'n', 'f', 'BA-ka', 2, 'HJP s.v. baka'),
    W('djed', 'djed', 'grandfather', 'n', 'm', 'DYED', 2, 'HJP s.v. djed', { forms: { acc: 'djeda' } }),
    W('prijatelj', 'prijatelj', 'friend (m)', 'n', 'm', 'PREE-ya-tely', 2, 'HJP s.v. prijatelj', { forms: { acc: 'prijatelja', ins: 'prijateljem' } }),
    W('prijateljica', 'prijateljica', 'friend (f)', 'n', 'f', 'pree-ya-te-LYI-tsa', 2, 'HJP s.v. prijateljica', { forms: { acc: 'prijateljicu' } }),
    W('ime', 'ime', 'name', 'n', 'n', 'EE-me', 2, 'HJP s.v. ime'),
    W('zovem-se', 'Zovem se…', 'My name is… (lit. "I call myself")', 'phrase', null, 'ZO-vem se', 2, 'EC ch. 12 Simple Conversations; CROA A1', { note: 'se is a second-position clitic: "Zovem se Ana", but "Moj muž se zove Marko."' }),
    W('ovo', 'ovo', 'this', 'pron', null, 'O-vo', 2, 'EC ch. 04 (ovo je pattern)', { note: 'For introducing: "Ovo je moja sestra." — works for any gender.' }),
    W('moj', 'moj / moja / moje', 'my', 'pron', null, 'MOY', 2, 'EC ch. 10 Possessives', { note: 'Agrees with the thing owned: moj brat, moja sestra, moje ime.' }),
    W('tvoj', 'tvoj / tvoja / tvoje', 'your (informal)', 'pron', null, 'TVOY', 2, 'EC ch. 10 Possessives'),
    W('on-ona', 'on / ona', 'he / she', 'pron', null, 'ON / O-na', 2, 'ALX §7'),
    W('tko', 'tko', 'who', 'pron', null, 'TKO', 2, 'HJP s.v. tko', { note: 'Croatian tko (Serbian uses ko). "Tko je ovo?" = Who is this?' }),

    /* ---- Unit 3 · Hrana i piće — food, drink, accusative ---- */
    W('kava', 'kava', 'coffee', 'n', 'f', 'KA-va', 3, 'HJP s.v. kava; HRW (top-frequency noun)', { forms: { acc: 'kavu', gen: 'kave' }, note: 'Croatian kava (Serbian kafa, Bosnian kahva). Coffee is a social institution: "ići na kavu".' }),
    W('caj', 'čaj', 'tea', 'n', 'm', 'CHAI', 3, 'HJP s.v. čaj', { forms: { gen: 'čaja' } }),
    W('voda', 'voda', 'water', 'n', 'f', 'VO-da', 3, 'HJP s.v. voda', { forms: { acc: 'vodu', gen: 'vode' } }),
    W('mlijeko', 'mlijeko', 'milk', 'n', 'n', 'mlee-YE-ko', 3, 'HJP s.v. mlijeko', { forms: { ins: 'mlijekom' }, note: 'The ije is the Croatian (ijekavian) reflex — Serbian has mleko.' }),
    W('pivo', 'pivo', 'beer', 'n', 'n', 'PEE-vo', 3, 'HJP s.v. pivo', { forms: { gen: 'piva' } }),
    W('vino', 'vino', 'wine', 'n', 'n', 'VEE-no', 3, 'HJP s.v. vino', { forms: { gen: 'vina' } }),
    W('sok', 'sok', 'juice', 'n', 'm', 'SOK', 3, 'HJP s.v. sok'),
    W('kruh', 'kruh', 'bread', 'n', 'm', 'KROOH', 3, 'HJP s.v. kruh', { note: 'Distinctively Croatian — Serbian uses hleb.' }),
    W('sir', 'sir', 'cheese', 'n', 'm', 'SEER', 3, 'HJP s.v. sir'),
    W('meso', 'meso', 'meat', 'n', 'n', 'ME-so', 3, 'HJP s.v. meso'),
    W('riba', 'riba', 'fish', 'n', 'f', 'REE-ba', 3, 'HJP s.v. riba', { forms: { acc: 'ribu' } }),
    W('juha', 'juha', 'soup', 'n', 'f', 'YU-ha', 3, 'HJP s.v. juha', { forms: { acc: 'juhu' }, note: 'Croatian juha (Serbian supa).' }),
    W('jabuka', 'jabuka', 'apple', 'n', 'f', 'YA-bu-ka', 3, 'HJP s.v. jabuka', { forms: { acc: 'jabuku' } }),
    W('kolac', 'kolač', 'cake', 'n', 'm', 'KO-lach', 3, 'HJP s.v. kolač'),
    W('piti', 'piti', 'to drink', 'v', null, 'PEE-tee', 3, 'HJP s.v. piti', { conj: 'pijem, piješ, pije, pijemo, pijete, piju', pf: 'popiti', note: '-e- family: pijem. Perfective partner: popiti (drink up).' }),
    W('jesti', 'jesti', 'to eat', 'v', null, 'YES-tee', 3, 'HJP s.v. jesti', { conj: 'jedem, jedeš, jede, jedemo, jedete, jedu', pf: 'pojesti', note: '-e- family with stem change: jedem.' }),
    W('zeljeti', 'željeti', 'to want / wish', 'v', null, 'ZHE-lye-tee', 3, 'HJP s.v. željeti', { conj: 'želim, želiš, želi, želimo, želite, žele', note: 'The polite way to order: "Želim kavu, molim."' }),
    W('imati', 'imati', 'to have', 'v', null, 'EE-ma-tee', 3, 'HJP s.v. imati', { conj: 'imam, imaš, ima, imamo, imate, imaju', note: 'Negative is fused: nemam (I don\'t have).' }),
    W('trebati', 'trebati', 'to need', 'v', null, 'TRE-ba-tee', 3, 'HJP s.v. trebati', { conj: 'trebam, trebaš, treba, trebamo, trebate, trebaju', note: 'In Croatian you can say "Trebam vodu" (I need water) directly.' }),

    /* ---- Unit 4 · Svaki dan — everyday verbs & aspect ---- */
    W('raditi', 'raditi', 'to work / to do', 'v', null, 'RA-dee-tee', 4, 'HJP s.v. raditi; HRW (top-20 verb)', { conj: 'radim, radiš, radi, radimo, radite, rade', note: '"Što radiš?" = What are you doing? — the most common conversation opener.' }),
    W('zivjeti', 'živjeti', 'to live', 'v', null, 'ZHEE-vye-tee', 4, 'HJP s.v. živjeti', { conj: 'živim, živiš, živi, živimo, živite, žive' }),
    W('govoriti', 'govoriti', 'to speak', 'v', null, 'go-VO-ree-tee', 4, 'HJP s.v. govoriti', { conj: 'govorim, govoriš, govori, govorimo, govorite, govore' }),
    W('uciti', 'učiti', 'to learn / study', 'v', null, 'U-chee-tee', 4, 'HJP s.v. učiti', { conj: 'učim, učiš, uči, učimo, učite, uče', pf: 'naučiti' }),
    W('voljeti', 'voljeti', 'to love / like', 'v', null, 'VO-lye-tee', 4, 'HJP s.v. voljeti', { conj: 'volim, voliš, voli, volimo, volite, vole', note: '"Volim te" = I love you. For things: "Volim kavu."' }),
    W('gledati', 'gledati', 'to watch / look at', 'v', null, 'GLE-da-tee', 4, 'HJP s.v. gledati', { conj: 'gledam, gledaš, gleda, gledamo, gledate, gledaju' }),
    W('slusati', 'slušati', 'to listen', 'v', null, 'SLU-sha-tee', 4, 'HJP s.v. slušati', { conj: 'slušam, slušaš, sluša, slušamo, slušate, slušaju' }),
    W('citati', 'čitati', 'to read', 'v', null, 'CHEE-ta-tee', 4, 'HJP s.v. čitati', { conj: 'čitam, čitaš, čita, čitamo, čitate, čitaju', pf: 'pročitati' }),
    W('pisati', 'pisati', 'to write', 'v', null, 'PEE-sa-tee', 4, 'HJP s.v. pisati', { conj: 'pišem, pišeš, piše, pišemo, pišete, pišu', pf: 'napisati', note: '-e- family with s→š: pišem.' }),
    W('znati', 'znati', 'to know', 'v', null, 'ZNA-tee', 4, 'HJP s.v. znati', { conj: 'znam, znaš, zna, znamo, znate, znaju', note: '"Ne znam" = I don\'t know — you will use this constantly.' }),
    W('razumjeti', 'razumjeti', 'to understand', 'v', null, 'ra-ZU-mye-tee', 4, 'HJP s.v. razumjeti', { conj: 'razumijem, razumiješ, razumije, razumijemo, razumijete, razumiju', note: '"Ne razumijem" — the survival phrase.' }),
    W('ici', 'ići', 'to go', 'v', null, 'EE-chee', 4, 'HJP s.v. ići', { conj: 'idem, ideš, ide, idemo, idete, idu', note: 'Infinitive and present look unrelated — learn idem with ići.' }),
    W('spavati', 'spavati', 'to sleep', 'v', null, 'SPA-va-tee', 4, 'HJP s.v. spavati', { conj: 'spavam, spavaš, spava, spavamo, spavate, spavaju' }),
    W('popiti', 'popiti', 'to drink up (perfective of piti)', 'v', null, 'PO-pee-tee', 4, 'HJP s.v. popiti; ALX §13', { conj: 'popijem, popiješ…', note: 'Perfective: the whole, finished act of drinking.' }),
    W('pojesti', 'pojesti', 'to eat up (perfective of jesti)', 'v', null, 'PO-yes-tee', 4, 'HJP s.v. pojesti; ALX §13', { conj: 'pojedem, pojedeš…' }),
    W('nauciti', 'naučiti', 'to learn (to completion; perfective of učiti)', 'v', null, 'na-U-chee-tee', 4, 'HJP s.v. naučiti; ALX §13', { conj: 'naučim, naučiš…' }),
    W('hrvatski', 'hrvatski', 'Croatian (language)', 'n', 'm', 'HUR-vat-skee', 4, 'HJP s.v. hrvatski', { note: 'Syllabic r: Hr-vat-ski. "Učim hrvatski."' }),
    W('engleski', 'engleski', 'English (language)', 'n', 'm', 'EN-gles-kee', 4, 'HJP s.v. engleski'),
    W('sto', 'što', 'what', 'pron', null, 'SHTO', 4, 'HJP s.v. što', { note: 'Što is the štokavian marker itself — the dialect is named after this word.' }),
    W('malo', 'malo', 'a little', 'adv', null, 'MA-lo', 4, 'HJP s.v. malo', { note: '"Govorim malo hrvatski." Your honest self-description for a while.' }),
    W('puno', 'puno', 'a lot / much', 'adv', null, 'PU-no', 4, 'HJP s.v. puno'),
    W('svaki', 'svaki', 'every', 'adj', null, 'SVA-kee', 4, 'HJP s.v. svaki', { note: '"svaki dan" = every day.' }),
    W('dan', 'dan', 'day', 'n', 'm', 'DAN', 4, 'HJP s.v. dan', { note: 'You met it inside "dobar dan" — here it stands alone.' }),
    W('knjiga', 'knjiga', 'book', 'n', 'f', 'KNYEE-ga', 4, 'HJP s.v. knjiga', { forms: { acc: 'knjigu', loc: 'knjizi' }, note: 'Locative knjizi shows the g→z change before -i.' }),

    /* ---- Unit 5 · Grad i putovanje — town, travel, locative ---- */
    W('grad', 'grad', 'city / town', 'n', 'm', 'GRAD', 5, 'HJP s.v. grad', { forms: { loc: 'gradu' } }),
    W('ulica', 'ulica', 'street', 'n', 'f', 'U-lee-tsa', 5, 'HJP s.v. ulica', { forms: { loc: 'ulici' } }),
    W('trg', 'trg', 'square', 'n', 'm', 'TURG', 5, 'HJP s.v. trg', { forms: { loc: 'trgu' }, note: 'Syllabic r again. Zagreb life orbits "Trg bana Jelačića".' }),
    W('more', 'more', 'sea', 'n', 'n', 'MO-re', 5, 'HJP s.v. more', { forms: { acc: 'more', loc: 'moru' }, note: '"Idemo na more" = the great Croatian summer sentence.' }),
    W('plaza', 'plaža', 'beach', 'n', 'f', 'PLA-zha', 5, 'HJP s.v. plaža', { forms: { acc: 'plažu', loc: 'plaži' } }),
    W('autobus', 'autobus', 'bus', 'n', 'm', 'AU-to-boos', 5, 'HJP s.v. autobus', { forms: { ins: 'autobusom' } }),
    W('vlak', 'vlak', 'train', 'n', 'm', 'VLAK', 5, 'HJP s.v. vlak', { forms: { ins: 'vlakom' }, note: 'Croatian vlak (Serbian voz).' }),
    W('kolodvor', 'kolodvor', 'station (rail/bus)', 'n', 'm', 'KO-lo-dvor', 5, 'HJP s.v. kolodvor', { forms: { loc: 'kolodvoru' } }),
    W('zracna-luka', 'zračna luka', 'airport', 'n', 'f', 'ZRACH-na LU-ka', 5, 'HJP s.v. luka', { note: 'Literally "air harbour". Aerodrom is also widely understood.' }),
    W('hotel', 'hotel', 'hotel', 'n', 'm', 'ho-TEL', 5, 'HJP s.v. hotel', { forms: { loc: 'hotelu' } }),
    W('restoran', 'restoran', 'restaurant', 'n', 'm', 'res-to-RAN', 5, 'HJP s.v. restoran', { forms: { loc: 'restoranu' } }),
    W('kafic', 'kafić', 'café / coffee bar', 'n', 'm', 'ka-FEECH', 5, 'HJP s.v. kafić', { forms: { loc: 'kafiću' }, note: 'Where Croatia actually happens.' }),
    W('kuca', 'kuća', 'house / home', 'n', 'f', 'KU-cha', 5, 'HJP s.v. kuća', { forms: { acc: 'kuću', loc: 'kući' }, note: '"Idem kući" = I\'m going home (special form).' }),
    W('stan', 'stan', 'flat / apartment', 'n', 'm', 'STAN', 5, 'HJP s.v. stan', { forms: { loc: 'stanu' } }),
    W('gdje', 'gdje', 'where', 'adv', null, 'GDYE', 5, 'HJP s.v. gdje', { note: '"Gdje je…?" = Where is…? (Croatian gdje, Serbian gde.)' }),
    W('ovdje', 'ovdje', 'here', 'adv', null, 'OV-dye', 5, 'HJP s.v. ovdje'),
    W('tamo', 'tamo', 'there', 'adv', null, 'TA-mo', 5, 'HJP s.v. tamo'),
    W('sada', 'sada', 'now', 'adv', null, 'SA-da', 5, 'HJP s.v. sada'),
    W('zagreb', 'Zagreb', 'Zagreb', 'n', 'm', 'ZA-greb', 5, 'HJP s.v. Zagreb', { forms: { acc: 'Zagreb', loc: 'Zagrebu' } }),
    W('hrvatska', 'Hrvatska', 'Croatia', 'n', 'f', 'HUR-vat-ska', 5, 'HJP s.v. Hrvatska', { forms: { acc: 'Hrvatsku', loc: 'Hrvatskoj' }, note: 'Declines like an adjective: u Hrvatskoj.' }),
    W('split', 'Split', 'Split', 'n', 'm', 'SPLEET', 5, 'HJP s.v. Split', { forms: { loc: 'Splitu' } }),
    W('lijep', 'lijep / lijepa / lijepo', 'beautiful / nice', 'adj', null, 'lee-YEP', 5, 'HJP s.v. lijep', { note: 'Agrees with gender: lijep grad, lijepa plaža, lijepo more.' }),

    /* ---- Unit 6 · Kupovina i brojevi — shopping, numbers, genitive ---- */
    W('jedan', 'jedan', 'one', 'num', null, 'YE-dan', 6, 'HJP s.v. jedan', { note: 'Agrees: jedan čaj (m), jedna kava (f), jedno pivo (n).' }),
    W('dva', 'dva / dvije', 'two', 'num', null, 'DVA / DVEE-ye', 6, 'HJP s.v. dva', { note: 'dvije with feminine nouns: dvije kave.' }),
    W('tri', 'tri', 'three', 'num', null, 'TREE', 6, 'HJP s.v. tri'),
    W('cetiri', 'četiri', 'four', 'num', null, 'che-TEE-ree', 6, 'HJP s.v. četiri'),
    W('pet', 'pet', 'five', 'num', null, 'PET', 6, 'HJP s.v. pet'),
    W('sest', 'šest', 'six', 'num', null, 'SHEST', 6, 'HJP s.v. šest'),
    W('sedam', 'sedam', 'seven', 'num', null, 'SE-dam', 6, 'HJP s.v. sedam'),
    W('osam', 'osam', 'eight', 'num', null, 'O-sam', 6, 'HJP s.v. osam'),
    W('devet', 'devet', 'nine', 'num', null, 'DE-vet', 6, 'HJP s.v. devet'),
    W('deset', 'deset', 'ten', 'num', null, 'DE-set', 6, 'HJP s.v. deset'),
    W('dvadeset', 'dvadeset', 'twenty', 'num', null, 'DVA-de-set', 6, 'HJP s.v. dvadeset; EC ch. 47 Numbers'),
    W('trideset', 'trideset', 'thirty', 'num', null, 'TREE-de-set', 6, 'HJP s.v. trideset; EC ch. 47 Numbers'),
    W('cetrdeset', 'četrdeset', 'forty', 'num', null, 'CHE-tr-de-set', 6, 'HJP s.v. četrdeset; EC ch. 47 Numbers'),
    W('pedeset', 'pedeset', 'fifty', 'num', null, 'PE-de-set', 6, 'HJP s.v. pedeset; EC ch. 47 Numbers'),
    W('sezdeset', 'šezdeset', 'sixty', 'num', null, 'SHEZ-de-set', 6, 'HJP s.v. šezdeset; EC ch. 47 Numbers'),
    W('sedamdeset', 'sedamdeset', 'seventy', 'num', null, 'SE-dam-de-set', 6, 'HJP s.v. sedamdeset; EC ch. 47 Numbers'),
    W('osamdeset', 'osamdeset', 'eighty', 'num', null, 'O-sam-de-set', 6, 'HJP s.v. osamdeset; EC ch. 47 Numbers'),
    W('devedeset', 'devedeset', 'ninety', 'num', null, 'DE-ve-de-set', 6, 'HJP s.v. devedeset; EC ch. 47 Numbers'),
    W('sto-num', 'sto', 'one hundred', 'num', null, 'STO', 6, 'HJP s.v. sto; EC ch. 47 Numbers', { note: 'Combine like English, just spoken: dvadeset pet = 25, sto = 100. (Same sound as što, "what" — context separates them.)' }),
    W('koliko', 'koliko', 'how much / how many', 'adv', null, 'KO-lee-ko', 6, 'HJP s.v. koliko', { note: 'Takes the genitive: koliko vode?' }),
    W('kostati', 'koštati', 'to cost', 'v', null, 'KOSH-ta-tee', 6, 'HJP s.v. koštati', { conj: 'košta, koštaju (3rd person)', note: '"Koliko košta?" = How much does it cost?' }),
    W('kupiti', 'kupiti', 'to buy (perfective)', 'v', null, 'KU-pee-tee', 6, 'HJP s.v. kupiti', { conj: 'kupim, kupiš…', note: 'Pair: kupovati (impf., kupujem) / kupiti (pf.). Here the perfective is the everyday one.' }),
    W('platiti', 'platiti', 'to pay (perfective)', 'v', null, 'PLA-tee-tee', 6, 'HJP s.v. platiti', { conj: 'platim, platiš…' }),
    W('novac', 'novac', 'money', 'n', 'm', 'NO-vats', 6, 'HJP s.v. novac'),
    W('euro', 'euro', 'euro', 'n', 'm', 'EU-ro', 6, 'HJP s.v. euro; HNB (euro since 1 Jan 2023)', { forms: { gen: 'eura' }, note: 'Croatia switched from the kuna to the euro on 1 January 2023.' }),
    W('racun', 'račun', 'bill / receipt', 'n', 'm', 'RA-choon', 6, 'HJP s.v. račun', { note: '"Račun, molim." — how you finish a meal out.' }),
    W('pekara', 'pekara', 'bakery', 'n', 'f', 'PE-ka-ra', 6, 'HJP s.v. pekara', { forms: { loc: 'pekari' }, note: 'The bakery is a Croatian daily ritual — burek, pecivo, kruh.' }),
    W('trznica', 'tržnica', 'market (farmers\')', 'n', 'f', 'TURZH-nee-tsa', 6, 'HJP s.v. tržnica', { forms: { loc: 'tržnici' } }),
    W('casa', 'čaša', 'glass', 'n', 'f', 'CHA-sha', 6, 'HJP s.v. čaša', { forms: { acc: 'čašu' }, note: '"čaša vode" — a glass of water; the genitive of quantity.' }),
    W('boca', 'boca', 'bottle', 'n', 'f', 'BO-tsa', 6, 'HJP s.v. boca', { forms: { acc: 'bocu' } }),

    /* ---- Unit 7 · Vrijeme — time & days ---- */
    W('danas', 'danas', 'today', 'adv', null, 'DA-nas', 7, 'HJP s.v. danas'),
    W('sutra', 'sutra', 'tomorrow', 'adv', null, 'SU-tra', 7, 'HJP s.v. sutra'),
    W('jucer', 'jučer', 'yesterday', 'adv', null, 'YU-cher', 7, 'HJP s.v. jučer', { note: 'Croatian jučer (Serbian juče).' }),
    W('tjedan', 'tjedan', 'week', 'n', 'm', 'TYE-dan', 7, 'HJP s.v. tjedan', { note: 'Distinctively Croatian — Serbian uses nedelja/sedmica.' }),
    W('godina', 'godina', 'year', 'n', 'f', 'GO-dee-na', 7, 'HJP s.v. godina'),
    W('sat', 'sat', 'hour / clock / o\'clock', 'n', 'm', 'SAT', 7, 'HJP s.v. sat', { note: '"Koliko je sati?" = What time is it?' }),
    W('ponedjeljak', 'ponedjeljak', 'Monday', 'n', 'm', 'po-ne-DYE-lyak', 7, 'HJP s.v. ponedjeljak', { forms: { acc: 'ponedjeljak' }, note: 'Days are lower-case in Croatian. "u ponedjeljak" = on Monday.' }),
    W('utorak', 'utorak', 'Tuesday', 'n', 'm', 'U-to-rak', 7, 'HJP s.v. utorak'),
    W('srijeda', 'srijeda', 'Wednesday', 'n', 'f', 'sree-YE-da', 7, 'HJP s.v. srijeda', { forms: { acc: 'srijedu' } }),
    W('cetvrtak', 'četvrtak', 'Thursday', 'n', 'm', 'che-TVUR-tak', 7, 'HJP s.v. četvrtak'),
    W('petak', 'petak', 'Friday', 'n', 'm', 'PE-tak', 7, 'HJP s.v. petak'),
    W('subota', 'subota', 'Saturday', 'n', 'f', 'SU-bo-ta', 7, 'HJP s.v. subota', { forms: { acc: 'subotu' } }),
    W('nedjelja', 'nedjelja', 'Sunday', 'n', 'f', 'NE-dye-lya', 7, 'HJP s.v. nedjelja', { forms: { acc: 'nedjelju' } }),
    W('ujutro', 'ujutro', 'in the morning', 'adv', null, 'U-yu-tro', 7, 'HJP s.v. ujutro'),
    W('navecer', 'navečer', 'in the evening', 'adv', null, 'NA-ve-cher', 7, 'HJP s.v. navečer'),
    W('vikend', 'vikend', 'weekend', 'n', 'm', 'VEE-kend', 7, 'HJP s.v. vikend'),
    W('kada', 'kada', 'when', 'adv', null, 'KA-da', 7, 'HJP s.v. kada', { note: 'Often shortened to kad in speech.' }),
    W('vidimo-se', 'Vidimo se!', 'See you!', 'phrase', null, 'VEE-dee-mo se', 7, 'EC ch. 12 Simple Conversations', { note: 'Literally "we see each other". "Vidimo se sutra!"' }),

    /* ---- Unit 8 · Prošlost — the past ---- */
    W('putovati', 'putovati', 'to travel', 'v', null, 'pu-TO-va-tee', 8, 'HJP s.v. putovati', { conj: 'putujem, putuješ, putuje, putujemo, putujete, putuju', note: '-ova- verbs swap to -uje- in the present: putujem.' }),
    W('posao', 'posao', 'work / job', 'n', 'm', 'PO-sao', 8, 'HJP s.v. posao', { forms: { loc: 'poslu' }, note: '"na poslu" = at work; "idem na posao" = off to work.' }),
    W('kino', 'kino', 'cinema', 'n', 'n', 'KEE-no', 8, 'HJP s.v. kino', { forms: { acc: 'kino', loc: 'kinu' } }),
    W('film', 'film', 'film / movie', 'n', 'm', 'FEELM', 8, 'HJP s.v. film'),
    W('glazba', 'glazba', 'music', 'n', 'f', 'GLAZ-ba', 8, 'HJP s.v. glazba', { forms: { acc: 'glazbu' }, note: 'Croatian glazba (Serbian muzika; muzika is heard in Croatia too).' }),
    W('vidjeti', 'vidjeti', 'to see', 'v', null, 'VEE-dye-tee', 8, 'HJP s.v. vidjeti', { conj: 'vidim, vidiš, vidi, vidimo, vidite, vide' }),
    W('sinoc', 'sinoć', 'last night', 'adv', null, 'SEE-noch', 8, 'HJP s.v. sinoć'),
    W('prosli', 'prošli / prošla / prošlo', 'last / past', 'adj', null, 'PROSH-lee', 8, 'HJP s.v. prošli', { note: '"prošli tjedan" = last week; "prošle godine" = last year.' }),
    W('bio', 'bio / bila', 'was (the participle of biti)', 'v', null, 'BEE-o / BEE-la', 8, 'EC ch. 24 Past Tense', { note: 'bio for a man, bila for a woman: "Bio sam doma." / "Bila sam doma."' }),
    W('doma', 'doma', 'at home / home', 'adv', null, 'DO-ma', 8, 'HJP s.v. doma', { note: 'Everyday Croatian: "Bio sam doma." (Standard also: kod kuće.)' }),

    /* ---- Unit 9 · Dativ i instrumental — giving & with ---- */
    W('dati', 'dati', 'to give (perfective)', 'v', null, 'DA-tee', 9, 'HJP s.v. dati', { conj: 'dam, daš, da, damo, date, daju', note: 'Pair: davati (impf., dajem) / dati (pf.).' }),
    W('pomoci', 'pomoći', 'to help (perfective)', 'v', null, 'PO-mo-chee', 9, 'HJP s.v. pomoći', { conj: 'pomognem, pomogneš…', note: 'Takes the dative: pomoći mami. "Možeš li mi pomoći?"' }),
    W('poklon', 'poklon', 'present / gift', 'n', 'm', 'PO-klon', 9, 'HJP s.v. poklon'),
    W('auto', 'auto', 'car', 'n', 'm', 'AU-to', 9, 'HJP s.v. auto', { forms: { ins: 'autom' }, note: 'Masculine despite -o.' }),
    W('taksi', 'taksi', 'taxi', 'n', 'm', 'TAK-see', 9, 'HJP s.v. taksi', { forms: { ins: 'taksijem' } }),
    W('limun', 'limun', 'lemon', 'n', 'm', 'LEE-moon', 9, 'HJP s.v. limun', { forms: { ins: 'limunom' } }),
    W('secer', 'šećer', 'sugar', 'n', 'm', 'SHE-cher', 9, 'HJP s.v. šećer', { forms: { gen: 'šećera' } }),
    W('s', 's / sa', 'with', 'prep', null, 'S', 9, 'HJP s.v. s', { note: '+ instrumental: s mlijekom, s prijateljem. "sa" before s/š/z/ž: sa šećerom.' }),
    W('bez', 'bez', 'without', 'prep', null, 'BEZ', 9, 'HJP s.v. bez', { note: '+ genitive: bez šećera, bez mlijeka.' }),
    W('moci', 'moći', 'can / to be able', 'v', null, 'MO-chee', 9, 'HJP s.v. moći', { conj: 'mogu, možeš, može, možemo, možete, mogu', note: 'Irregular: mogu (I can), možeš. "Može!" alone = "OK, deal!"' }),

    /* ---- Unit 10 · Razgovor — putting it together ---- */
    W('misliti', 'misliti', 'to think', 'v', null, 'MEES-lee-tee', 10, 'HJP s.v. misliti', { conj: 'mislim, misliš, misli, mislimo, mislite, misle', note: '"Mislim da…" = I think that… — your opinion-starter.' }),
    W('morati', 'morati', 'must / to have to', 'v', null, 'MO-ra-tee', 10, 'HJP s.v. morati', { conj: 'moram, moraš, mora, moramo, morate, moraju' }),
    W('htjeti', 'htjeti', 'to want / will', 'v', null, 'HTYE-tee', 10, 'HJP s.v. htjeti', { conj: 'hoću, hoćeš, hoće, hoćemo, hoćete, hoće (clitics: ću, ćeš, će…)', note: 'Doubles as the future auxiliary: "Ići ću." Negative: neću.' }),
    W('ideja', 'ideja', 'idea', 'n', 'f', 'ee-DE-ya', 10, 'HJP s.v. ideja', { forms: { acc: 'ideju' } }),
    W('mozda', 'možda', 'maybe', 'adv', null, 'MOZH-da', 10, 'HJP s.v. možda'),
    W('naravno', 'naravno', 'of course', 'adv', null, 'na-RAV-no', 10, 'HJP s.v. naravno'),
    W('zajedno', 'zajedno', 'together', 'adv', null, 'ZA-yed-no', 10, 'HJP s.v. zajedno'),
    W('sretan', 'sretan / sretna', 'happy', 'adj', null, 'SRE-tan', 10, 'HJP s.v. sretan', { note: 'Croatian sretan (Serbian srećan). "Sretan rođendan!" = Happy birthday!' }),
    W('umoran', 'umoran / umorna', 'tired', 'adj', null, 'U-mo-ran', 10, 'HJP s.v. umoran'),
    W('gladan', 'gladan / gladna', 'hungry', 'adj', null, 'GLA-dan', 10, 'HJP s.v. gladan', { note: 'Adjectives agree: "Gladan sam" (m) / "Gladna sam" (f).' }),
    W('zedan', 'žedan / žedna', 'thirsty', 'adj', null, 'ZHE-dan', 10, 'HJP s.v. žedan'),
    W('dobiti', 'dobiti', 'to get / receive (perfective)', 'v', null, 'DO-bee-tee', 10, 'HJP s.v. dobiti', { conj: 'dobijem, dobiješ…', note: '"Možemo li dobiti račun?" — the restaurant essential.' })
  ];

  // Dalmatian forms, shown beside the standard word (see the grammar note
  // "g-dalmatinski"). The standard štokavian stays the answer; this is just how
  // home sounds. Correct any of these to your family's actual usage with the
  // in-app flag → review tool.
  const DAL = {
    // ikavian: standard ije/je → i
    dijete: 'dite', mlijeko: 'mliko', lijep: 'lip', gdje: 'di', ovdje: 'ovdi',
    nedjelja: 'nedilja', srijeda: 'srida', dva: 'dvi', ponedjeljak: 'ponediljak',
    vidjeti: 'vidit', voljeti: 'volit', zeljeti: 'želit', zivjeti: 'živit', razumjeti: 'razumit',
    // coastal / Adriatic-Romance lexicon
    baka: 'nona', djed: 'nono', tata: 'ćaća', trg: 'pjaca', ulica: 'kala', sat: 'ura', novac: 'šoldi'
  };
  WORDS.forEach(w => { if (DAL[w.id]) w.dal = DAL[w.id]; });

  /* ---------------------------------------------------------------------
     SENTENCES — each is an SRS card too. words[] must reference word ids;
     a sentence enters lessons only once all its words are introduced.
     alt[] = accepted alternative English; altHr[] = accepted Croatian.
     --------------------------------------------------------------------- */
  const S = (id, unit, hr, en, words, grammar, source, extra) =>
    Object.assign({ id, unit, hr, en, words, grammar: grammar || [], source }, extra || {});

  const SENTENCES = [
    /* Unit 1 */
    S('s101', 1, 'Dobar dan!', 'Good day!', ['dobar-dan'], [], 'EC ch. 12 Simple Conversations (attested fixed phrase)', { alt: ['Hello!', 'Good afternoon!'] }),
    S('s102', 1, 'Bok! Kako si?', 'Hi! How are you?', ['bok', 'kako-si'], ['g-ti-vi'], 'EC ch. 12 Simple Conversations', { alt: ['Hi, how are you?'] }),
    S('s103', 1, 'Dobro sam, hvala.', 'I am well, thank you.', ['dobro', 'ja-sam', 'hvala'], ['g-biti-sg'], 'EC ch. 12 Simple Conversations (standard reply)', { alt: ['I\'m fine, thanks.', 'I am fine, thank you.'] }),
    S('s104', 1, 'Ja sam Ana.', 'I am Ana.', ['ja-sam'], ['g-biti-sg'], 'EC ch. 02 Simplest Sentences (pattern "Ja sam X")', { alt: ['I\'m Ana.'] }),
    S('s105', 1, 'Drago mi je.', 'Nice to meet you.', ['drago-mi-je'], ['g-red-rijeci'], 'EC ch. 12 Simple Conversations (attested fixed phrase)', { alt: ['Pleased to meet you.'] }),
    S('s106', 1, 'Doviđenja i laku noć!', 'Goodbye and good night!', ['dovidenja', 'i', 'laku-noc'], [], 'EC ch. 12 Simple Conversations', { alt: ['Goodbye and goodnight!'] }),
    S('s107', 1, 'Dobro jutro!', 'Good morning!', ['dobro-jutro'], [], 'EC ch. 12 Simple Conversations (attested fixed phrase)'),
    S('s108', 1, 'Oprostite, molim vas.', 'Excuse me, please.', ['oprostite', 'molim'], ['g-ti-vi'], 'EC ch. 12 (molim te/vas politeness pattern)', { alt: ['Excuse me please.'] }),

    /* Unit 2 */
    S('s201', 2, 'Ovo je moja obitelj.', 'This is my family.', ['ovo', 'moj', 'obitelj'], ['g-posvojne', 'g-rod'], 'Pattern: EC ch. 04 (ovo je pattern), §Possessives'),
    S('s202', 2, 'Ovo je moj brat.', 'This is my brother.', ['ovo', 'moj', 'brat'], ['g-posvojne'], 'Pattern: EC ch. 04 (ovo je pattern)'),
    S('s203', 2, 'Zovem se Ivan.', 'My name is Ivan.', ['zovem-se'], ['g-red-rijeci'], 'EC ch. 12 Simple Conversations (attested pattern "Zovem se X")', { alt: ['I am called Ivan.', 'I\'m called Ivan.'] }),
    S('s204', 2, 'Ona je moja sestra.', 'She is my sister.', ['on-ona', 'moj', 'sestra'], ['g-posvojne', 'g-rod'], 'Pattern: EC ch. 04 Pronouns'),
    S('s205', 2, 'Ovo je moja žena.', 'This is my wife.', ['ovo', 'moj', 'zena'], ['g-posvojne'], 'Pattern: EC ch. 04 (ovo je pattern)'),
    S('s206', 2, 'Moj muž se zove Marko.', 'My husband is called Marko.', ['moj', 'muz', 'zovem-se'], ['g-red-rijeci'], 'Pattern: EC ch. 12 Simple Conversations; clitic order ALX §12', { alt: ['My husband\'s name is Marko.'] }),
    S('s207', 2, 'Tko je ovo?', 'Who is this?', ['tko', 'ovo'], [], 'Pattern: EC ch. 26 Yes or No'),
    S('s208', 2, 'Kako se zoveš?', 'What is your name?', ['zovem-se', 'kako-si'], ['g-red-rijeci'], 'EC ch. 12 Simple Conversations (attested pattern)', { alt: ['What are you called?', 'What\'s your name?'] }),

    /* Unit 3 */
    S('s301', 3, 'Pijem kavu.', 'I am drinking coffee.', ['piti', 'kava'], ['g-akuzativ'], 'Pattern: EC ch. 05 Accusative (canonical example type)', { alt: ['I drink coffee.', 'I\'m drinking coffee.'] }),
    S('s302', 3, 'Jedem kruh i sir.', 'I am eating bread and cheese.', ['jesti', 'kruh', 'i', 'sir'], ['g-akuzativ'], 'Pattern: EC ch. 05 Accusative', { alt: ['I eat bread and cheese.', 'I\'m eating bread and cheese.'] }),
    S('s303', 3, 'Želim čaj, molim.', 'I would like tea, please.', ['zeljeti', 'caj', 'molim'], ['g-akuzativ'], 'Pattern: CROA A1 (ordering)', { alt: ['I want tea, please.'] }),
    S('s304', 3, 'Imam brata i sestru.', 'I have a brother and a sister.', ['imati', 'brat', 'sestra', 'i'], ['g-akuzativ'], 'Pattern: EC ch. 05 Accusative (animate masculine)', { alt: ['I have a brother and sister.'] }),
    S('s305', 3, 'Trebam vodu.', 'I need water.', ['trebati', 'voda'], ['g-akuzativ'], 'Pattern: EC ch. 05 Accusative; HJP s.v. trebati'),
    S('s306', 3, 'Piješ li kavu?', 'Do you drink coffee?', ['piti', 'kava'], ['g-li', 'g-akuzativ'], 'Pattern: EC ch. 26 Yes or No', { alt: ['Are you drinking coffee?'] }),
    S('s307', 3, 'Ne pijem pivo.', 'I do not drink beer.', ['ne', 'piti', 'pivo'], ['g-negacija'], 'Pattern: EC ch. 09 Negation', { alt: ['I don\'t drink beer.'] }),
    S('s308', 3, 'Ona jede ribu.', 'She is eating fish.', ['on-ona', 'jesti', 'riba'], ['g-akuzativ'], 'Pattern: EC ch. 05 Accusative', { alt: ['She eats fish.', 'She\'s eating fish.'] }),
    S('s309', 3, 'Želim juhu i salatu.', 'I would like soup and salad.', ['zeljeti', 'juha', 'i'], ['g-akuzativ'], 'Pattern: CROA A1 (ordering)', { alt: ['I want soup and salad.'], note: 'salata declines like juha: salatu.' }),

    /* Unit 4 */
    S('s401', 4, 'Učim hrvatski.', 'I am learning Croatian.', ['uciti', 'hrvatski'], ['g-prezent'], 'Pattern: CROA A1; EC Essential Verbs', { alt: ['I learn Croatian.', 'I\'m learning Croatian.'] }),
    S('s402', 4, 'Govorite li engleski?', 'Do you speak English? (polite)', ['govoriti', 'engleski'], ['g-li', 'g-ti-vi'], 'EC ch. 26 Yes or No (attested survival phrase)', { alt: ['Do you speak English?'] }),
    S('s403', 4, 'Razumijem malo.', 'I understand a little.', ['razumjeti', 'malo'], ['g-prezent'], 'Pattern: EC Essential Verbs'),
    S('s404', 4, 'Oprostite, ne razumijem.', 'Sorry, I do not understand.', ['oprostite', 'ne', 'razumjeti'], ['g-negacija'], 'EC (attested survival phrase)', { alt: ['Sorry, I don\'t understand.', 'Excuse me, I don\'t understand.'] }),
    S('s405', 4, 'Što radiš?', 'What are you doing?', ['sto', 'raditi'], ['g-prezent'], 'EC ch. 26 Yes or No (attested conversational phrase)', { alt: ['What are you doing'] }),
    S('s406', 4, 'Volim te.', 'I love you.', ['voljeti', 'ti'], ['g-red-rijeci'], 'EC (attested; te = clitic accusative of ti)'),
    S('s407', 4, 'Čitam knjigu.', 'I am reading a book.', ['citati', 'knjiga'], ['g-akuzativ', 'g-prezent'], 'Pattern: EC ch. 05 Accusative', { alt: ['I read a book.', 'I\'m reading a book.'] }),
    S('s408', 4, 'Idem spavati.', 'I am going to sleep.', ['ici', 'spavati'], ['g-prezent'], 'Pattern: EC (ići + infinitive)', { alt: ['I\'m going to sleep.', 'I am going to bed.'] }),
    S('s409', 4, 'Želim popiti kavu.', 'I want to drink (up) a coffee.', ['zeljeti', 'popiti', 'kava'], ['g-vid'], 'Pattern: ALX §13 (perfective with a single complete act)', { alt: ['I want to drink a coffee.', 'I want to have a coffee.'] }),
    S('s410', 4, 'Učim hrvatski svaki dan.', 'I study Croatian every day.', ['uciti', 'hrvatski', 'svaki', 'dan'], ['g-vid'], 'Pattern: EC Essential Verbs (habitual imperfective)', { alt: ['I learn Croatian every day.'] }),
    S('s411', 4, 'Ne znam.', 'I do not know.', ['ne', 'znati'], ['g-negacija'], 'EC (attested conversational phrase)', { alt: ['I don\'t know.'] }),

    /* Unit 5 */
    S('s501', 5, 'Idem u Zagreb.', 'I am going to Zagreb.', ['ici', 'zagreb'], ['g-smjer'], 'Pattern: EC ch. 06 Destinations (u + accusative)', { alt: ['I\'m going to Zagreb.', 'I go to Zagreb.'] }),
    S('s502', 5, 'Živim u Zagrebu.', 'I live in Zagreb.', ['zivjeti', 'zagreb'], ['g-lokativ'], 'Pattern: EC ch. 15 Locations (canonical contrast with s501)'),
    S('s503', 5, 'Gdje je kolodvor?', 'Where is the station?', ['gdje', 'kolodvor'], [], 'Pattern: EC ch. 26 Yes or No (gdje je X)', { alt: ['Where\'s the station?'] }),
    S('s504', 5, 'Idemo na plažu!', 'Let\'s go to the beach!', ['ici', 'plaza'], ['g-smjer'], 'Pattern: EC ch. 06 Destinations (na + accusative)', { alt: ['We are going to the beach!', 'We\'re going to the beach!'] }),
    S('s505', 5, 'Oni su u restoranu.', 'They are in the restaurant.', ['restoran'], ['g-lokativ', 'g-biti-pl'], 'Pattern: EC ch. 15 Locations', { alt: ['They are at the restaurant.'] }),
    S('s506', 5, 'Hotel je tamo.', 'The hotel is there.', ['hotel', 'tamo'], [], 'Pattern: EC ch. 02 Simplest Sentences'),
    S('s507', 5, 'Živimo u Hrvatskoj.', 'We live in Croatia.', ['zivjeti', 'hrvatska'], ['g-lokativ'], 'Pattern: EC ch. 15 Locations (adjectival declension of -ska names)'),
    S('s508', 5, 'More je lijepo.', 'The sea is beautiful.', ['more', 'lijep'], ['g-rod'], 'Pattern: EC ch. 13 Adjectives (neuter agreement)'),
    S('s509', 5, 'Idemo u kafić na kavu.', 'We are going to the café for a coffee.', ['ici', 'kafic', 'kava'], ['g-smjer'], 'Pattern: EC; "ići na kavu" is the attested idiom', { alt: ['We\'re going to the cafe for coffee.', 'Let\'s go to the cafe for a coffee.'] }),
    S('s510', 5, 'Gdje si sada?', 'Where are you now?', ['gdje', 'sada'], ['g-biti-sg'], 'Pattern: EC ch. 26 Yes or No', { alt: ['Where are you right now?'] }),

    /* Unit 6 */
    S('s601', 6, 'Koliko košta?', 'How much does it cost?', ['koliko', 'kostati'], [], 'EC (attested shopping phrase)', { alt: ['How much is it?'] }),
    S('s602', 6, 'Koliko košta kava?', 'How much does the coffee cost?', ['koliko', 'kostati', 'kava'], [], 'Pattern: EC ch. 26 Yes or No', { alt: ['How much is the coffee?'] }),
    S('s603', 6, 'To košta pet eura.', 'That costs five euros.', ['kostati', 'pet', 'euro'], ['g-genitiv', 'g-brojevi'], 'Pattern: EC ch. 47 Numbers (5+ → genitive plural); euro: HNB 2023', { alt: ['It costs five euros.'] }),
    S('s604', 6, 'Želim čašu vode.', 'I would like a glass of water.', ['zeljeti', 'casa', 'voda'], ['g-genitiv'], 'Pattern: EC ch. 20 Genitive (quantity)', { alt: ['I want a glass of water.'] }),
    S('s605', 6, 'Bocu vina, molim.', 'A bottle of wine, please.', ['boca', 'vino', 'molim'], ['g-genitiv', 'g-akuzativ'], 'Pattern: CROA A1 (ordering); genitive of quantity', { alt: ['A bottle of wine please.'] }),
    S('s606', 6, 'Račun, molim.', 'The bill, please.', ['racun', 'molim'], [], 'EC (attested restaurant phrase)', { alt: ['The check, please.', 'The bill please.'] }),
    S('s607', 6, 'Kupujem kruh u pekari.', 'I buy bread at the bakery.', ['kupiti', 'kruh', 'pekara'], ['g-lokativ', 'g-vid'], 'Pattern: EC ch. 15 Locations; kupovati/kupiti pair ALX §13', { alt: ['I am buying bread at the bakery.'], note: 'kupujem — the imperfective kupovati, for the habit.' }),
    S('s608', 6, 'Dvije kave, molim.', 'Two coffees, please.', ['dva', 'kava', 'molim'], ['g-brojevi', 'g-genitiv'], 'EC ch. 47 Numbers (attested café order; 2–4 + genitive singular)', { alt: ['Two coffees please.'] }),
    S('s609', 6, 'To košta dvadeset pet eura.', 'That costs twenty-five euros.', ['kostati', 'dvadeset', 'pet', 'euro'], ['g-brojevi'], 'Pattern: EC ch. 47 Numbers (compound numerals); euro: HNB 2023', { alt: ['It costs twenty-five euros.', 'That costs 25 euros.'] }),

    /* Unit 7 */
    S('s701', 7, 'Koliko je sati?', 'What time is it?', ['koliko', 'sat'], ['g-vrijeme-izrazi'], 'EC ch. 12 (attested fixed phrase)'),
    S('s702', 7, 'Vidimo se sutra!', 'See you tomorrow!', ['vidimo-se', 'sutra'], ['g-red-rijeci'], 'EC (attested parting phrase)', { alt: ['See you tomorrow.'] }),
    S('s703', 7, 'Danas je ponedjeljak.', 'Today is Monday.', ['danas', 'ponedjeljak'], [], 'Pattern: EC ch. 12 (time)'),
    S('s704', 7, 'U subotu idemo na more.', 'On Saturday we are going to the seaside.', ['subota', 'ici', 'more'], ['g-vrijeme-izrazi', 'g-smjer'], 'Pattern: EC ch. 12 (u + accusative for days); "na more" attested idiom', { alt: ['On Saturday we go to the sea.', 'We are going to the sea on Saturday.'] }),
    S('s705', 7, 'Radim svaki dan.', 'I work every day.', ['raditi', 'svaki', 'dan'], ['g-prezent'], 'Pattern: EC Essential Verbs'),
    S('s706', 7, 'Kada ideš u Zagreb?', 'When are you going to Zagreb?', ['kada', 'ici', 'zagreb'], ['g-smjer'], 'Pattern: EC ch. 26 Yes or No', { alt: ['When do you go to Zagreb?'] }),
    S('s707', 7, 'Ujutro pijem kavu.', 'In the morning I drink coffee.', ['ujutro', 'piti', 'kava'], ['g-vrijeme-izrazi'], 'Pattern: EC ch. 12 (time)', { alt: ['I drink coffee in the morning.'] }),

    /* Unit 8 */
    S('s801', 8, 'Bio sam u Splitu.', 'I was in Split. (man speaking)', ['bio', 'split'], ['g-perfekt', 'g-lokativ'], 'Pattern: EC ch. 24 Past Tense (canonical example type)', { alt: ['I have been to Split.'] }),
    S('s802', 8, 'Bila sam u Zagrebu.', 'I was in Zagreb. (woman speaking)', ['bio', 'zagreb'], ['g-perfekt', 'g-lokativ'], 'Pattern: EC ch. 24 Past Tense'),
    S('s803', 8, 'Što si radio jučer?', 'What did you do yesterday? (to a man)', ['sto', 'raditi', 'jucer'], ['g-perfekt'], 'Pattern: EC ch. 24 Past Tense (questions)', { alt: ['What were you doing yesterday?'] }),
    S('s804', 8, 'Gledali smo film.', 'We watched a film.', ['gledati', 'film'], ['g-perfekt'], 'Pattern: EC ch. 24 Past Tense', { alt: ['We watched a movie.', 'We were watching a film.'] }),
    S('s805', 8, 'Jeli smo ribu.', 'We ate fish.', ['jesti', 'riba'], ['g-perfekt', 'g-akuzativ'], 'Pattern: EC ch. 24 Past Tense'),
    S('s806', 8, 'Popio sam kavu.', 'I drank (up) my coffee. (man speaking)', ['popiti', 'kava'], ['g-perfekt', 'g-vid-proslost'], 'Pattern: ALX §13–14 (perfective past)', { alt: ['I drank my coffee.', 'I finished my coffee.'] }),
    S('s807', 8, 'Sinoć smo bili u kinu.', 'Last night we were at the cinema.', ['sinoc', 'bio', 'kino'], ['g-perfekt', 'g-lokativ'], 'Pattern: EC ch. 24 Past Tense', { alt: ['We were at the cinema last night.', 'Last night we were at the movies.'] }),
    S('s808', 8, 'Putovali smo na more.', 'We travelled to the seaside.', ['putovati', 'more'], ['g-perfekt', 'g-smjer'], 'Pattern: EC ch. 24 Past Tense; "na more" attested idiom', { alt: ['We traveled to the sea.'] }),

    /* Unit 9 */
    S('s901', 9, 'Putujemo autobusom.', 'We are travelling by bus.', ['putovati', 'autobus'], ['g-instrumental'], 'Pattern: EC ch. 35 Instrumental (means of transport, canonical example type)', { alt: ['We travel by bus.', 'We\'re travelling by bus.'] }),
    S('s902', 9, 'Kava s mlijekom, molim.', 'Coffee with milk, please.', ['kava', 's', 'mlijeko', 'molim'], ['g-instrumental'], 'EC ch. 35 Instrumental (attested café order)', { alt: ['A coffee with milk, please.'] }),
    S('s903', 9, 'Čaj bez šećera, molim.', 'Tea without sugar, please.', ['caj', 'bez', 'secer', 'molim'], ['g-genitiv'], 'Pattern: EC ch. 20 Genitive (bez + gen)', { alt: ['Tea with no sugar, please.'] }),
    S('s904', 9, 'Idem s prijateljem na kavu.', 'I am going for a coffee with a friend.', ['ici', 's', 'prijatelj', 'kava'], ['g-instrumental'], 'Pattern: EC ch. 35 Instrumental (company); "na kavu" attested idiom', { alt: ['I\'m going for coffee with a friend.'] }),
    S('s905', 9, 'Dajem mami poklon.', 'I am giving mum a present.', ['dati', 'mama', 'poklon'], ['g-dativ'], 'Pattern: EC ch. 16 Giving to Someone (canonical example type)', { alt: ['I give mum a present.', 'I am giving mom a present.'] }),
    S('s906', 9, 'Možeš li mi pomoći?', 'Can you help me?', ['moci', 'pomoci'], ['g-dativ', 'g-red-rijeci'], 'EC ch. 16 Giving to Someone (attested phrase; mi = dative clitic)', { alt: ['Could you help me?'] }),
    S('s907', 9, 'Idemo taksijem.', 'We are going by taxi.', ['ici', 'taksi'], ['g-instrumental'], 'Pattern: EC ch. 35 Instrumental', { alt: ['We\'ll go by taxi.', 'We go by taxi.'] }),

    /* Unit 10 */
    S('s1001', 10, 'Mislim da je to dobra ideja.', 'I think that is a good idea.', ['misliti', 'ideja', 'dobro'], ['g-red-rijeci'], 'Pattern: EC ("mislim da" + clause)', { alt: ['I think that\'s a good idea.', 'I think it is a good idea.'] }),
    S('s1002', 10, 'Moramo ići.', 'We have to go.', ['morati', 'ici'], ['g-prezent'], 'Pattern: EC (modal + infinitive)', { alt: ['We must go.'] }),
    S('s1003', 10, 'Hoćeš li ići s nama?', 'Will you go with us?', ['htjeti', 'ici', 's'], ['g-futur', 'g-instrumental'], 'Pattern: EC ch. 40 Future Tense (hoćeš li + infinitive; nama = instrumental of mi)', { alt: ['Will you come with us?', 'Do you want to go with us?'] }),
    S('s1004', 10, 'Ići ću sutra.', 'I will go tomorrow.', ['ici', 'htjeti', 'sutra'], ['g-futur'], 'Pattern: EC ch. 40 Future Tense (verb-first joins the clitic)', { alt: ['I\'ll go tomorrow.'] }),
    S('s1005', 10, 'Možda sutra.', 'Maybe tomorrow.', ['mozda', 'sutra'], [], 'Pattern: conversational; EC ch. 12'),
    S('s1006', 10, 'Gladan sam.', 'I am hungry. (man speaking)', ['gladan'], ['g-rod'], 'Pattern: EC ch. 13 Adjectives (predicate agreement)', { alt: ['I\'m hungry.'] }),
    S('s1007', 10, 'Umorna sam, idem spavati.', 'I am tired, I am going to sleep. (woman speaking)', ['umoran', 'ici', 'spavati'], ['g-rod'], 'Pattern: EC ch. 13 Adjectives', { alt: ['I\'m tired, I\'m going to bed.'] }),
    S('s1008', 10, 'Možemo li dobiti račun?', 'Could we get the bill?', ['moci', 'dobiti', 'racun'], ['g-li'], 'EC (attested restaurant phrase)', { alt: ['Can we get the bill?', 'May we have the bill?'] }),
    S('s1009', 10, 'Naravno! Vidimo se navečer.', 'Of course! See you in the evening.', ['naravno', 'vidimo-se', 'navecer'], [], 'Pattern: conversational', { alt: ['Of course, see you tonight.'] }),
    S('s1010', 10, 'Učimo hrvatski zajedno.', 'We are learning Croatian together.', ['uciti', 'hrvatski', 'zajedno'], ['g-prezent'], 'Pattern: EC Essential Verbs', { alt: ['We learn Croatian together.'] })
  ];

  /* ---------------------------------------------------------------------
     UNITS
     --------------------------------------------------------------------- */
  const UNITS = [
    { n: 1, id: 'u1', title: 'First steps', hrTitle: 'Prvi koraci', blurb: 'Greetings, courtesy, and the sounds of Croatian. The three "good ___" greetings quietly introduce all three genders.' },
    { n: 2, id: 'u2', title: 'Family & people', hrTitle: 'Obitelj i ljudi', blurb: 'Introduce your family. Noun gender, all of biti, possessives — and a first look at the vocative.' },
    { n: 3, id: 'u3', title: 'Food & drink', hrTitle: 'Hrana i piće', blurb: 'Order like a local. The accusative — the object case — arrives with coffee.' },
    { n: 4, id: 'u4', title: 'Every day', hrTitle: 'Svaki dan', blurb: 'The verbs you will actually use, the three present-tense families, and the big idea: aspect.' },
    { n: 5, id: 'u5', title: 'Town & travel', hrTitle: 'Grad i putovanje', blurb: 'Going vs. being: the locative case, and the u/na direction switch.' },
    { n: 6, id: 'u6', title: 'Shopping & numbers', hrTitle: 'Kupovina i brojevi', blurb: 'Numbers to 100, prices in euros, and the genitive: a glass of water, a bottle of wine.' },
    { n: 7, id: 'u7', title: 'Time & days', hrTitle: 'Vrijeme i dani', blurb: 'Days of the week, parts of the day, making plans.' },
    { n: 8, id: 'u8', title: 'The past', hrTitle: 'Prošlost', blurb: 'One past tense to rule them all: the perfekt — and aspect doing the work of English tenses.' },
    { n: 9, id: 'u9', title: 'Giving & with', hrTitle: 'Dativ i instrumental', blurb: 'Coffee with milk, travelling by bus, helping each other: the dative and instrumental.' },
    { n: 10, id: 'u10', title: 'Conversation', hrTitle: 'Razgovor', blurb: 'Opinions, plans, the future tense — putting it all together.' }
  ];

  /* ---------------------------------------------------------------------
     Override merge: native-speaker corrections (stored in DB) are applied
     on top of this base content at load time. See app.js.
     --------------------------------------------------------------------- */
  function applyOverrides(overrides) {
    const byId = {};
    overrides.forEach(o => { byId[o.id] = o.patch; });
    WORDS.forEach(w => { if (byId[w.id]) Object.assign(w, byId[w.id]); });
    SENTENCES.forEach(s => { if (byId[s.id]) Object.assign(s, byId[s.id]); });
    GRAMMAR.forEach(g => { if (byId[g.id]) Object.assign(g, byId[g.id]); });
  }

  const wordById = {}; WORDS.forEach(w => { wordById[w.id] = w; });
  const sentById = {}; SENTENCES.forEach(s => { sentById[s.id] = s; });
  const gramById = {}; GRAMMAR.forEach(g => { gramById[g.id] = g; });

  function item(cardId) {
    if (cardId.startsWith('w:')) return wordById[cardId.slice(2)] || null;
    if (cardId.startsWith('s:')) return sentById[cardId.slice(2)] || null;
    return null;
  }

  window.CRO = window.CRO || {};
  CRO.content = {
    SOURCES, GRAMMAR, WORDS, SENTENCES, UNITS,
    wordById, sentById, gramById, item, applyOverrides
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CRO.content;
})();
