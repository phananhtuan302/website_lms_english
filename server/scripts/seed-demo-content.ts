/** Curated English-only local demo content. No external services or placeholder words. */
export const vocabulary = [
  [
    'Campus life',
    'lecture:a lesson delivered to a group|seminar:a small discussion class|assignment:a piece of schoolwork|deadline:the latest time to finish work|library:a place to borrow books|scholarship:money awarded to support study|tuition:the cost of instruction|curriculum:the subjects taught in a course|campus:the grounds of a college|dormitory:a shared student residence|notebook:a book for writing notes|revision:study before an examination|feedback:comments that help improvement|graduate:a person who has completed a degree|attendance:being present at a lesson',
  ],
  [
    'Healthy living',
    'nutrition:the study of food and health|exercise:physical activity to stay fit|hydration:keeping enough water in the body|sleep:a natural period of rest|balance:a healthy mixture of activities|stamina:the ability to keep going|recovery:returning to good health|stretch:to extend a muscle gently|protein:a nutrient needed for growth|fibre:a plant nutrient that helps digestion|portion:the amount of food served|routine:a regular sequence of actions|wellbeing:a state of health and happiness|prevention:action that stops a problem|mindfulness:careful attention to the present',
  ],
  [
    'Travel planning',
    'itinerary:a plan for a journey|passport:an official travel identity document|luggage:bags taken on a journey|reservation:an arrangement to keep a place|departure:the act of leaving|arrival:the act of reaching a place|platform:a place to board a train|destination:the place someone is going|fare:the price of a journey|transfer:changing from one service to another|customs:the border service checking goods|souvenir:an object kept to remember a visit|accommodation:a place to stay|excursion:a short pleasure trip|landmark:a well-known feature of a place',
  ],
  [
    'Protecting nature',
    'habitat:the natural home of an organism|species:a group of similar living organisms|conservation:protection of the natural world|recycle:to process used material again|renewable:able to be replaced naturally|emission:gas released into the air|biodiversity:the variety of living things|ecosystem:living things and their environment|pollution:harmful substances in the environment|drought:a long period without rain|wildlife:animals living in natural conditions|sustainable:able to continue without damage|compost:decayed material used to enrich soil|wetland:land covered by shallow water|restoration:the process of repairing damage',
  ],
  [
    'Working together',
    'colleague:a person you work with|collaborate:to work together|agenda:a list of meeting topics|proposal:a suggested plan|budget:a plan for spending money|recruit:to employ a new worker|interview:a formal discussion with a candidate|skill:an ability learned through practice|leadership:the ability to guide a group|negotiate:to discuss and reach agreement|responsibility:a duty to take care of something|promotion:movement to a more senior job|strategy:a plan to achieve a goal|achievement:a successful result|initiative:the ability to act without being told',
  ],
  [
    'Digital citizenship',
    'privacy:control over personal information|password:a secret used to access an account|browser:software used to view websites|network:a system of connected devices|download:to copy data onto a device|upload:to send data from a device|backup:a spare copy of important data|device:an electronic tool|software:programs used by a computer|update:a newer improved version|encryption:encoding data to protect it|permission:approval to do something|reliable:able to be trusted|source:the origin of information|accessibility:design that everyone can use',
  ],
  [
    'Food and cooking',
    'ingredient:one of the foods in a recipe|recipe:instructions for preparing food|simmer:to cook gently below boiling|chop:to cut into small pieces|bake:to cook in an oven|flavour:the taste of food|texture:the feel of food in the mouth|seasoning:salt or spices added for taste|fresh:recently produced or picked|ripe:ready to eat after growing|stir:to mix using a circular movement|whisk:to beat a mixture quickly|measure:to find an exact amount|serve:to give food to someone|leftovers:food remaining after a meal',
  ],
  [
    'City communities',
    'neighbourhood:a local area in a town|pedestrian:a person travelling on foot|pavement:a path beside a road|junction:a place where roads meet|commute:a regular journey to work|council:a local governing body|facility:a place providing a service|volunteer:a person who helps without payment|resident:a person who lives in a place|district:an area within a city|affordable:reasonably priced|infrastructure:basic public systems and services|traffic:vehicles moving on roads|community:people living or working together|renovation:work that improves an old building',
  ],
  [
    'Science discoveries',
    'hypothesis:an idea that can be tested|evidence:information supporting a conclusion|experiment:a controlled scientific test|observe:to watch carefully|variable:a factor that may change|data:facts collected for analysis|analyse:to examine in detail|result:the outcome of a process|theory:an explanation supported by evidence|sample:a small part used for testing|accurate:correct and precise|laboratory:a room for scientific work|discovery:something learned for the first time|measurement:a quantity found using a tool|conclusion:a judgement based on evidence',
  ],
  [
    'Arts and culture',
    'exhibition:a public display of art|portrait:a picture of a person|sculpture:a three-dimensional work of art|audience:people watching a performance|rehearsal:practice before a performance|gallery:a place displaying art|heritage:traditions inherited from the past|festival:a special celebration|creative:able to produce original ideas|rhythm:a regular pattern of sound|melody:a sequence of musical notes|performance:an act of presenting entertainment|craft:a skill involving making things|inspiration:an idea that encourages creativity|tradition:a custom passed between generations',
  ],
  [
    'Personal finance',
    'savings:money kept for later use|expense:money spent on something|income:money received from work or investments|receipt:a record of payment|discount:a reduction in price|interest:money paid for borrowing or saving|deposit:money placed in an account|withdraw:to take money from an account|currency:the money used in a country|loan:money borrowed and repaid later|debt:money owed to someone|investment:money used to gain future benefit|insurance:financial protection against loss|purchase:something bought|refund:money returned after a purchase',
  ],
  [
    'Sports and teamwork',
    'tournament:a competition with several matches|coach:a person who trains a team|referee:an official enforcing sports rules|teamwork:cooperative effort by a group|practice:repeated activity to improve a skill|endurance:the ability to continue despite tiredness|opponent:a person competing against you|victory:success in a competition|defeat:failure to win|equipment:items needed for an activity|athlete:a person trained in sport|championship:a competition to find the best player|technique:a particular way of doing something|warmup:gentle exercise before sport|sportsmanship:fair and respectful sporting behaviour',
  ],
] as const;

export const grammar = [
  [
    'Present simple',
    'Use the present simple for habits and facts. Add -s for he, she and it. Use do/does for questions.',
    'Maya ___ to school by bus every day.',
    'travels',
    'travel|travelling|travelled',
  ],
  [
    'Present continuous',
    'Use am/is/are + -ing for actions happening now or temporary situations.',
    'The students ___ a project right now.',
    'are preparing',
    'prepare|prepared|has prepared',
  ],
  [
    'Past simple',
    'Use the past simple for completed past events. Regular verbs end in -ed; many common verbs are irregular.',
    'We ___ the museum last Saturday.',
    'visited',
    'visit|are visiting|have visit',
  ],
  [
    'Past continuous',
    'Use was/were + -ing for an action in progress at a past time.',
    'At eight last night, I ___ dinner.',
    'was cooking',
    'cook|am cooking|have cooked',
  ],
  [
    'Present perfect',
    'Use have/has + past participle for experiences and past events connected to now.',
    'She ___ three books this month so far.',
    'has read',
    'reads|is reading|readed',
  ],
  [
    'Future plans',
    'Use be going to for plans decided before speaking and predictions based on evidence.',
    'Look at those clouds! It ___ rain.',
    'is going to',
    'going|goes to|was go to',
  ],
  [
    'First conditional',
    'Use if + present simple, will + base verb for real future possibilities.',
    'If it rains, we ___ indoors.',
    'will stay',
    'stayed|would stayed|staying',
  ],
  [
    'Second conditional',
    'Use if + past simple, would + base verb for imagined present or future situations.',
    'If I had more time, I ___ a language.',
    'would learn',
    'will learned|learns|am learn',
  ],
  [
    'Comparatives',
    'Use -er or more to compare two things. Use than before the second thing.',
    'This route is ___ than the old one.',
    'safer',
    'safest|most safe|safely',
  ],
  [
    'Superlatives',
    'Use the + -est or most to compare one thing with a whole group.',
    'This is the ___ building in town.',
    'tallest',
    'taller|tall|more tall',
  ],
  [
    'Articles',
    'Use a/an for one non-specific singular countable noun and the for something already identified.',
    'She bought ___ umbrella because it was raining.',
    'an',
    'a|some|many',
  ],
  [
    'Countable nouns',
    'Use many and a few with plural countable nouns. Use much and a little with uncountable nouns.',
    'There are ___ apples in the basket.',
    'a few',
    'much|a little|any water',
  ],
  [
    'Modal advice',
    'Use should + base verb to give advice. The verb does not take -s after a modal.',
    'You ___ take regular breaks when studying.',
    'should',
    'must to|should to|ought',
  ],
  [
    'Modal obligation',
    'Use must or have to for obligation. Must not expresses prohibition.',
    'Visitors ___ wear safety glasses in the laboratory.',
    'must',
    'can to|must to|has',
  ],
  [
    'Passive voice',
    'Use be + past participle when the action or recipient is more important than the actor.',
    'The bridge ___ in 1998.',
    'was built',
    'built|is building|has build',
  ],
  [
    'Relative clauses',
    'Use who for people and which for things to add information about a noun.',
    'The scientist ___ won the award works here.',
    'who',
    'which|where|when',
  ],
  [
    'Reported speech',
    'When reporting past speech, verb tenses often move one step back. Change pronouns to match the speaker.',
    'He said that he ___ tired.',
    'was',
    'is be|were be|being',
  ],
  [
    'Gerunds',
    'Some verbs, including enjoy and avoid, are followed by the -ing form.',
    'They enjoy ___ in the countryside.',
    'walking',
    'walk|to walking|walked',
  ],
  [
    'Infinitives',
    'Some verbs, including decide and hope, are followed by to + base verb.',
    'We decided ___ the earlier train.',
    'to take',
    'taking|take|taken',
  ],
  [
    'Prepositions of time',
    'Use at for clock times, on for days and dates, and in for months and years.',
    'The workshop starts ___ Monday.',
    'on',
    'in|at|by the',
  ],
  [
    'Adverbs of frequency',
    'Frequency adverbs usually go before a main verb but after the verb be.',
    'She ___ arrives on time; she is never late.',
    'always',
    'yesterday|tomorrow|at',
  ],
  [
    'Past perfect',
    'Use had + past participle for an action completed before another past event.',
    'When we arrived, the film ___ already started.',
    'had',
    'has|is|was being',
  ],
  [
    'Question tags',
    'Use a short negative tag after a positive statement, and a positive tag after a negative statement.',
    'You like reading, ___ you?',
    'don’t',
    'doesn’t|aren’t|isn’t',
  ],
  [
    'Linking ideas',
    'Use although for contrast, because for reasons, and therefore for results.',
    '___ it was cold, we enjoyed the walk.',
    'Although',
    'Because of|Despite of|Therefore',
  ],
] as const;

export const passage = `A. The Greenbridge Learning Garden began on an unused patch of land behind a public library. Local students asked residents what they needed before making a plan. Older residents wanted quiet benches, while families asked for a place where children could learn about food. The students decided to include both ideas rather than choose just one.\n\nB. Every Saturday, volunteers meet at nine in the morning. They use collected rainwater and turn vegetable scraps into compost. A local carpenter repaired old wooden boxes instead of buying new containers. These choices reduced costs and gave volunteers a practical lesson in using resources responsibly. No chemical pesticides are used in the garden.\n\nC. During the first summer, the group recorded the number of visitors and the weight of vegetables harvested. They donated half the harvest to a community kitchen. The results were encouraging, but a dry month showed the need for a larger water tank. Next year the students plan to run free cooking workshops and share their records with another neighbourhood.`;
export const listeningTranscript = `Welcome to the Greenbridge library workshop. Please arrive at nine thirty on Saturday, not at nine as printed on the old poster. The workshop will take place in Room Four beside the garden entrance. Bring a notebook and a reusable water bottle. All gardening tools will be supplied. The morning session is free, but the optional lunch costs five pounds. To reserve a place, give your name to the librarian by Thursday. If it rains, the planting activity will move into the greenhouse. Thank you, and we look forward to seeing you.`;
