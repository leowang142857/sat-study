import type { Mistake, Word } from './types'
import { newSrs } from './srs'
import { uid } from './db'

const SOURCE_M1 = '2026年10月北美A卷 · RW Module 1'
const SOURCE_M2 = '2026年10月北美A卷 · RW Module 2'

function mistake(partial: Omit<Mistake, 'id' | 'createdAt' | 'updatedAt' | 'section' | 'format' | 'images' | 'figures' | 'tags' | 'mastered' | 'reviews'>): Mistake {
  const now = Date.now()
  return {
    id: uid(),
    createdAt: now,
    updatedAt: now,
    section: 'RW',
    format: 'mc',
    images: [],
    figures: [],
    tags: [],
    mastered: false,
    reviews: [],
    ...partial,
  }
}

export function seedMistakes(): Mistake[] {
  return [
    mistake({
      source: `${SOURCE_M1} · Q4`,
      questionType: 'words-in-context',
      passage:
        "Biologist Bryson Voirin and colleagues have employed hat-like monitors to ______ long-standing misconceptions about the activity patterns of sloths. It was once widely believed that the Linnaeus's two-toed sloth and other sloths are always slow. Data from the monitors reveal that sloths can move quickly in the tree canopies where they live.",
      question: 'Which choice completes the text with the most logical and precise word or phrase?',
      choices: { A: 'analyze', B: 'perpetuate', C: 'codify', D: 'dispel' },
      correct: 'D',
      myAnswer: 'A',
      explanation:
        '数据显示树懒其实能快速移动，推翻了“树懒总是很慢”的误解 → dispel（消除）。analyze 不够精确；perpetuate（延续）方向相反；codify（编成条文）意思不对。',
    }),
    mistake({
      source: `${SOURCE_M1} · Q7`,
      questionType: 'text-structure',
      passage:
        "Using data from a global consumer-to-consumer retail website, Alfio Ventura, Eve Sarah Troll, and colleagues evaluated whether pricing approaches vary across countries. Although the website will convert prices to the buyers' home currency, most sellers target local markets, so {{the researchers used virtual private networks to collect prices in each country's predominant currency.}} They found some striking inter-country differences in pricing strategy, such as the fact that 84.0% of sellers in Puerto Rico price their goods in whole numbers (e.g., $17) but only 0.3% of sellers in Indonesia do.",
      question: 'Which choice best describes the function of the underlined portion in the text as a whole?',
      choices: {
        A: 'It describes an aspect of the study design that allowed the researchers to see how buyers in a given country reacted to pricing strategies rarely used in that country.',
        B: 'It presents a component of the researchers’ methodology that enabled them to convert all prices to the same currency for comparison.',
        C: 'It discusses how the researchers controlled for the possibility that pricing strategies could change depending on the goods being sold.',
        D: 'It explains a step that the researchers took to ensure that their data accurately reflected sellers’ intended prices.',
      },
      correct: 'D',
      myAnswer: 'C',
      explanation:
        '网站会自动换算成买家货币，看不到卖家原定价（如 $17 整数价）。用 VPN 按当地货币抓价格 = 保证数据反映卖家本来的定价。B 方向反了（是避免统一换算）；C 原文没提商品种类；A 研究的是卖家不是买家。',
    }),
    mistake({
      source: `${SOURCE_M1} · Q12`,
      questionType: 'inferences',
      passage:
        'In the Mexican dialect of Spanish, the consonant s is pronounced with greater tension in the tongue than it is in Castilian, the dominant dialect in Spain, resulting in a sharper sound. Margarita Hidalgo, a linguist at San Diego State University, argues that Mexican Spanish acquired this pronunciation from Nahuatl, the language of the Nahua people in Central Mexico: as the Spanish colonizers of Mexico incorporated Nahuatl words into their speech, and as more and more Nahuas spoke Spanish as a second language, the Nahuatl pronunciation of the s consonant replaced the Castilian pronunciation.',
      question: 'Information in the text best supports which statement about the consonant s?',
      choices: {
        A: 'The pronunciation of this consonant requires greater tension in the tongue in Nahuatl than in Castilian.',
        B: 'The pronunciation of this consonant in Nahuatl may have been affected by its pronunciation in Mexican Spanish.',
        C: 'This consonant appears in a higher percentage of Nahuatl vocabulary than of Castilian vocabulary.',
        D: 'The pronunciation of this consonant is the principal difference between the Mexican and Castilian dialects of Spanish.',
      },
      correct: 'A',
      myAnswer: 'B',
      explanation:
        '墨西哥西语的 s 比卡斯蒂利亚语更紧，而这个发音来自纳瓦特尔语 → 纳瓦特尔语的 s 也比卡斯蒂利亚语更紧。B 影响方向反了；C 没比较出现频率；D 的 “principal” 过度推断。',
    }),
    mistake({
      source: `${SOURCE_M2} · Q24`,
      questionType: 'transitions',
      passage:
        "India's prominence as a supplier of information technology services to companies in North America and Europe is a result of several factors, including the country's investments in technical education, but the most serendipitous is India's large number of English speakers. English is spoken by more people in India—129 million—than in any nation except the US. ______ only about 10% of Indians speak English.",
      question: 'Which choice completes the text with the most logical transition?',
      choices: {
        A: 'Accordingly, 90% of people in India—over one billion people—do not speak the language:',
        B: 'However, English is not the first language for most English speakers in India:',
        C: 'As a result, careers in information technology services are not available to all people in India:',
        D: 'Granted, this numerical advantage is due more to population size than to language penetration:',
      },
      correct: 'D',
      myAnswer: 'A',
      explanation:
        '冒号后的 “only about 10% speak English” 是用来解释前一句的。D：人数多是因为人口基数大、不是普及率高，正好被 10% 解释。A 的 Accordingly 因果不成立，且和 10% 重复。',
    }),
    mistake({
      source: `${SOURCE_M2} · Q25`,
      questionType: 'rhetorical-synthesis',
      passage:
        "While researching a topic, a student has taken the following notes:\n• The Way to Rainy Mountain was written by Kiowa author N. Scott Momaday.\n• The book traces the Kiowa people's migration from the Yellowstone headwaters region to Rainy Mountain, Oklahoma.\n• It is divided into twenty-four narrative units.\n• Each unit contains three short passages, each with a separate focus: one on ancient stories from Kiowa oral tradition, one on written historical records, and one on Momaday's personal reflections.\n• Together, these different perspectives provide a better understanding of the Kiowa people's journey than a single perspective would.",
      question:
        "The student wants to describe The Way to Rainy Mountain's overall organization. Which choice most effectively uses relevant information from the notes to accomplish this goal?",
      choices: {
        A: 'With passages dedicated to different historical perspectives, The Way to Rainy Mountain provides a better understanding of the Kiowa people’s history than do other approaches.',
        B: 'The Way to Rainy Mountain is divided into three narrative units with twenty-four passages each, some of which discuss Kiowa oral traditions, written historical records, and Momaday’s personal reflections.',
        C: 'The Way to Rainy Mountain traces the Kiowa people’s migration from the Yellowstone headwaters region to Rainy Mountain, Oklahoma.',
        D: 'The Way to Rainy Mountain is divided into twenty-four narrative units with three passages each: one on traditional Kiowa stories, one on historical records, and one on the author’s personal reflections.',
      },
      correct: 'D',
      myAnswer: 'B',
      explanation:
        '目标是“整体结构”。D 准确：24 个单元 × 每单元 3 段。B 把数字说反了（3 单元 × 24 段）。A 讲好处、C 讲内容，都不是结构。笔记题先看目标，再逐个核对选项细节。',
    }),
  ]
}

function word(w: string, partOfSpeech: string, definition: string, chinese: string, example: string, source = '2026年10月北美A卷'): Word {
  return { id: uid(), createdAt: Date.now(), word: w, partOfSpeech, definition, chinese, example, notes: '', source, srs: newSrs(), lapses: 0 }
}

export function seedWords(): Word[] {
  return [
    word('dispel', 'v.', 'to make a belief or feeling disappear', '消除，驱散（误解、疑虑）', 'Data from the monitors dispel long-standing misconceptions about sloths.'),
    word('perpetuate', 'v.', 'to make something continue for a long time', '使延续，使永久化', 'Stereotypes are often perpetuated by the media.'),
    word('codify', 'v.', 'to arrange laws or rules into a systematic code', '编成法典，使系统化', 'The rules were finally codified in 1890.'),
    word('serendipitous', 'adj.', 'occurring by happy chance', '偶然发现的，幸运巧合的', 'The most serendipitous factor is India’s large number of English speakers.'),
    word('mitigate', 'v.', 'to make something less severe or harmful', '减轻，缓和', 'Niche distinction may mitigate the apparent risk to ecological stability.'),
    word('engender', 'v.', 'to cause or give rise to a feeling or situation', '引起，导致', 'the risk engendered by this pattern'),
    word('conspecific', 'n./adj.', 'a member of the same species', '同种个体；同种的', 'Rare trees have few conspecifics nearby.'),
    word('contingent', 'adj.', 'dependent on something that may or may not happen', '取决于…的（contingent on）', 'Scaling up is contingent on having sufficient space.'),
  ]
}
