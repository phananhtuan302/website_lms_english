const xlsx = require('xlsx');
const path = require('path');

// 50 general beginner/intermediate English words with Vietnamese meanings, matching
// T-085's expected column format exactly (case-insensitive headers):
// term, meaning, ipa, imageUrl, audioUrl, exampleSentence, synonyms, antonyms
const words = [
  ['apple', 'quả táo', '/ˈæp.əl/', 'She ate an ___ for breakfast.', '', ''],
  ['book', 'quyển sách', '/bʊk/', 'I am reading a good ___.', '', ''],
  ['cat', 'con mèo', '/kæt/', 'The ___ is sleeping on the sofa.', '', 'dog'],
  ['dog', 'con chó', '/dɒg/', 'My ___ likes to play in the park.', '', 'cat'],
  ['elephant', 'con voi', '/ˈel.ɪ.fənt/', 'The ___ is the largest land animal.', '', ''],
  ['friend', 'bạn bè', '/frend/', 'She is my best ___.', 'buddy, pal', 'enemy'],
  ['garden', 'khu vườn', '/ˈgɑː.dən/', 'We grow flowers in the ___.', '', ''],
  ['happy', 'vui vẻ, hạnh phúc', '/ˈhæp.i/', 'The children look ___ today.', 'glad, joyful', 'sad'],
  ['house', 'ngôi nhà', '/haʊs/', 'They live in a big ___.', 'home', ''],
  ['ice', 'nước đá', '/aɪs/', 'The lake froze into ___.', '', ''],
  ['jump', 'nhảy', '/dʒʌmp/', 'The frog can ___ very high.', 'leap', ''],
  ['kitchen', 'nhà bếp', '/ˈkɪtʃ.ɪn/', 'Mom is cooking dinner in the ___.', '', ''],
  ['lion', 'sư tử', '/ˈlaɪ.ən/', 'The ___ is the king of the jungle.', '', ''],
  ['morning', 'buổi sáng', '/ˈmɔː.nɪŋ/', 'I always drink milk in the ___.', '', 'evening'],
  ['notebook', 'quyển vở', '/ˈnəʊt.bʊk/', 'Write the new words in your ___.', '', ''],
  ['orange', 'quả cam', '/ˈɒr.ɪndʒ/', 'This ___ is very sweet.', '', ''],
  ['pencil', 'bút chì', '/ˈpen.səl/', 'Can I borrow your ___?', '', ''],
  ['quiet', 'yên tĩnh', '/ˈkwaɪ.ət/', 'Please be ___ in the library.', 'silent', 'noisy'],
  ['river', 'dòng sông', '/ˈrɪv.ər/', 'Fish swim in the ___.', '', ''],
  ['school', 'trường học', '/skuːl/', 'We go to ___ every weekday.', '', ''],
  ['table', 'cái bàn', '/ˈteɪ.bəl/', 'Put the plates on the ___.', '', ''],
  ['umbrella', 'cái ô, dù', '/ʌmˈbrel.ə/', 'Take an ___ because it is raining.', '', ''],
  ['village', 'ngôi làng', '/ˈvɪl.ɪdʒ/', 'My grandmother lives in a small ___.', '', 'city'],
  ['window', 'cửa sổ', '/ˈwɪn.dəʊ/', 'Open the ___ for some fresh air.', '', ''],
  ['young', 'trẻ', '/jʌŋ/', 'The ___ boy is playing football.', '', 'old'],
  ['zebra', 'con ngựa vằn', '/ˈziː.brə/', 'A ___ has black and white stripes.', '', ''],
  ['strong', 'khỏe mạnh', '/strɒŋ/', 'He is very ___ and can lift heavy boxes.', 'powerful', 'weak'],
  ['weak', 'yếu', '/wiːk/', 'The old bridge is too ___ to cross.', '', 'strong'],
  ['big', 'to, lớn', '/bɪg/', 'That is a very ___ house.', 'large', 'small'],
  ['small', 'nhỏ', '/smɔːl/', 'She has a ___ dog.', 'little', 'big'],
  ['fast', 'nhanh', '/fɑːst/', 'The car is very ___.', 'quick', 'slow'],
  ['slow', 'chậm', '/sləʊ/', 'The turtle is ___ but steady.', '', 'fast'],
  ['hot', 'nóng', '/hɒt/', 'The soup is too ___ to eat.', '', 'cold'],
  ['cold', 'lạnh', '/kəʊld/', 'It is very ___ outside today.', '', 'hot'],
  ['beautiful', 'xinh đẹp', '/ˈbjuː.tɪ.fəl/', 'The sunset looks ___ tonight.', 'pretty', 'ugly'],
  ['clever', 'thông minh', '/ˈklev.ər/', 'She is a ___ student.', 'smart, intelligent', ''],
  ['study', 'học tập', '/ˈstʌd.i/', 'I need to ___ for my English test.', 'learn', ''],
  ['listen', 'lắng nghe', '/ˈlɪs.ən/', 'Please ___ to the teacher carefully.', 'hear', ''],
  ['write', 'viết', '/raɪt/', 'Can you ___ your name here?', '', ''],
  ['read', 'đọc', '/riːd/', 'I like to ___ story books.', '', ''],
  ['speak', 'nói', '/spiːk/', 'Can you ___ English?', 'talk', ''],
  ['family', 'gia đình', '/ˈfæm.əl.i/', 'My ___ has four members.', '', ''],
  ['brother', 'anh/em trai', '/ˈbrʌð.ər/', 'My older ___ is a doctor.', '', 'sister'],
  ['sister', 'chị/em gái', '/ˈsɪs.tər/', 'My younger ___ loves to draw.', '', 'brother'],
  ['teacher', 'giáo viên', '/ˈtiː.tʃər/', 'Our English ___ is very kind.', '', 'student'],
  ['student', 'học sinh', '/ˈstjuː.dənt/', 'Every ___ must do their homework.', 'pupil', 'teacher'],
  ['weather', 'thời tiết', '/ˈweð.ər/', 'The ___ is sunny today.', '', ''],
  ['season', 'mùa', '/ˈsiː.zən/', 'Summer is my favorite ___.', '', ''],
  ['color', 'màu sắc', '/ˈkʌl.ər/', 'What ___ do you like best?', '', ''],
  ['number', 'con số', '/ˈnʌm.bər/', 'Can you count this ___ in English?', '', ''],
];

const header = ['term', 'meaning', 'ipa', 'imageUrl', 'audioUrl', 'exampleSentence', 'synonyms', 'antonyms'];
const rows = words.map(([term, meaning, ipa, exampleSentence, synonyms, antonyms]) => [
  term,
  meaning,
  ipa,
  '',
  '',
  exampleSentence,
  synonyms,
  antonyms,
]);

const sheetData = [header, ...rows];
const worksheet = xlsx.utils.aoa_to_sheet(sheetData);
worksheet['!cols'] = [
  { wch: 12 }, { wch: 22 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 40 }, { wch: 18 }, { wch: 14 },
];

const workbook = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(workbook, worksheet, 'Vocabulary');

const outPath = path.resolve(__dirname, '..', 'sample-50-vocabulary-words.xlsx');
xlsx.writeFile(workbook, outPath);
console.log(`Wrote ${rows.length} words to ${outPath}`);
