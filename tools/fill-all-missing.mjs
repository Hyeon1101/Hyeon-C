import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'public', 'data');
const KO_DATA = join(DATA, 'ko');

const SUPPLEMENTARY_DATA = {
  // HSK 1
  '没': {
    k: ['[동사] 없다.', '[부사] ~하지 않았다 (과거의 부정).'],
    x: [
      { zh: '我没有钱。', py: 'wǒ méiyǒu qián。', ko: '저는 돈이 없어요.' },
      { zh: '他昨天没来学校。', py: 'tā zuótiān méi lái xuéxiào。', ko: '그는 어제 학교에 오지 않았어요.' },
    ],
  },
  '多': {
    k: ['[형용사] 많다.', '[부사] 얼마(나) (정도·수량을 묻는 의문).'],
    x: [
      { zh: '这里的苹果很多。', py: 'zhèlǐ de píngguǒ hěn duō。', ko: '이곳의 사과는 매우 많아요.' },
      { zh: '你多大了？', py: 'nǐ duō dà le？', ko: '나이가 어떻게 되세요?' },
    ],
  },
  '打电话': {
    k: ['[동사] 전화를 걸다.'],
    x: [
      { zh: '我正在给妈妈打电话。', py: 'wǒ zhèngzài gěi māma dǎ diànhuà。', ko: '저는 엄마에게 전화를 걸고 있어요.' },
      { zh: '请下午给我打电话。', py: 'qǐng xiàwǔ gěi wǒ dǎ diànhuà。', ko: '오후에 저에게 전화해 주세요.' },
    ],
  },

  // HSK 2
  '打篮球': {
    k: ['[동사] 농구를 하다.'],
    x: [
      { zh: '他每个周末都去打篮球。', py: 'tā měi gè zhōumò dōu qù dǎ lánqiú。', ko: '그는 주말마다 농구를 하러 가요.' },
      { zh: '你会打篮球吗？', py: 'nǐ huì dǎ lánqiú ma？', ko: '너 농구할 줄 아니?' },
    ],
  },

  // HSK 3
  '春': {
    k: ['[명사] 봄. 봄철.', '[명사] 생기(生氣).'],
    x: [
      { zh: '春天来了，花儿都开了。', py: 'chūntiān lái le, huār dōu kāi le。', ko: '봄이 와서 꽃들이 모두 피었어요.' },
      { zh: '一年之计在于春。', py: 'yì nián zhī jì zài yú chūn。', ko: '일 년의 계획은 봄에 있다.' },
    ],
  },

  // HSK 4
  '打印': {
    k: ['[동사] 인쇄하다. 프린트하다.'],
    x: [
      { zh: '请帮我打印这份文件。', py: 'qǐng bāng wǒ dǎyìn zhè fèn wénjiàn。', ko: '이 서류 좀 인쇄해 주세요.' },
      { zh: '打印机里没有纸了。', py: 'dǎyìnjī lǐ méiyǒu zhǐ le。', ko: '프린터에 종이가 다 떨어졌어요.' },
    ],
  },
  '长江': {
    k: ['[고유명사] 장강. 양쯔강 (중국에서 가장 긴 강).'],
    x: [
      { zh: '长江是中国最长的河流。', py: 'chángjiāng shì zhōngguó zuì cháng de héliú。', ko: '장강은 중국에서 가장 긴 강입니다.' },
      { zh: '长江流经中国多个省市。', py: 'chángjiāng liújīng zhōngguó duō gè shěngshì。', ko: '장강은 중국의 여러 성과 시를 흐릅니다.' },
    ],
  },
  '复印': {
    k: ['[명사,동사] 복사(하다).'],
    x: [
      { zh: '请把这张表格复印两份。', py: 'qǐng bǎ zhè zhāng biǎogé fùyìn liǎng fèn。', ko: '이 양식을 두 부 복사해 주세요.' },
      { zh: '这台复印机坏了。', py: 'zhè tái fùyìnjī huài le。', ko: '이 복사기가 고장 났어요.' },
    ],
  },

  // HSK 5
  '幸运': {
    k: ['[명사] 행운.', '[형용사] 운이 좋다.'],
    x: [
      { zh: '能在这里遇到你真是太幸运了。', py: 'néng zài zhèlǐ yù dào nǐ zhēn shì tài xìngyùn le。', ko: '여기서 당신을 만나다니 정말 행운이에요.' },
      { zh: '祝你好运，祝你幸运！', py: 'zhù nǐ hǎoyùn, zhù nǐ xìngyùn！', ko: '행운을 빌어요!' },
    ],
  },
  '除': {
    k: ['[동사] 없애다. 제거하다.', '[전치사] ~을 제외하고 (除了).', '[동사] 나누다 (나눗셈).'],
    x: [
      { zh: '除了他以外，大家都到了。', py: 'chúle tā yǐwài, dàjiā dōu dào le。', ko: '그를 제외하고 모두 도착했습니다.' },
      { zh: '六除以二等于三。', py: 'liù chú yǐ èr děngyú sān。', ko: '6 나누기 2는 3이다.' },
    ],
  },
  '伙伴': {
    k: ['[명사] 짝. 동료. 동반자. 파트너.'],
    x: [
      { zh: '他是我们最值得信赖的合作伙伴。', py: 'tā shì wǒmen zuì zhídé xìnlài de hézuò huǒbàn。', ko: '그는 우리의 가장 신뢰할 수 있는 협력 파트너입니다.' },
      { zh: '童年的小伙伴们如今都在哪里呢？', py: 'tóngnián de xiǎohuǒbànmen rújīn dōu zài nǎlǐ ne？', ko: '어린 시절의 소꿉친구들은 지금 어디에 있을까?' },
    ],
  },
  '太太': {
    k: ['[명사] 부인. 아내. 사모님.'],
    x: [
      { zh: '李太太每天早上去公园散步。', py: 'lǐ tàitai měitiān zǎoshang qù gōngyuán sànbù。', ko: '이 선생 부인은 매일 아침 공원에 산책을 갑니다.' },
      { zh: '我和我太太结婚十年了。', py: 'wǒ hé wǒ tàitai jiéhūn shí nián le。', ko: '나와 내 아내는 결혼한 지 10년이 되었다.' },
    ],
  },
  '项链': {
    k: ['[명사] 목걸이.'],
    x: [
      { zh: '这条金项链是妈妈送给我的生日礼物。', py: 'zhè tiáo jīn xiàngliàn shì māma sòng gěi wǒ de shēngrì lǐwù。', ko: '이 금목걸이는 엄마가 나에게 준 생일 선물입니다.' },
    ],
  },
  '彩虹': {
    k: ['[명사] 무지개.'],
    x: [
      { zh: '大雨过后，天空中出现了一道美丽的彩虹。', py: 'dàyǔ guò hòu, tiānkōng zhōng chūxiàn le yí dào měilì de cǎihóng。', ko: '폭우가 지난 뒤 하늘에 아름다운 무지개가 나타났습니다.' },
    ],
  },
  '体贴': {
    k: ['[동사,형용사] 자상하다. 살뜰히 보살피다. 배려심이 깊다.'],
    x: [
      { zh: '他是一个非常体贴的人，总是为别人着想。', py: 'tā shì yí gè fēicháng tǐtiē de rén, zǒngshì wèi biérén zhuóxiǎng。', ko: '그는 남을 항상 배려하는 매우 자상한 사람입니다.' },
    ],
  },
  '蜜蜂': {
    k: ['[명사] 꿀벌.'],
    x: [
      { zh: '花园里有很多蜜蜂在采蜜。', py: 'huāyuán lǐ yǒu hěn duō mìfēng zài cǎimì。', ko: '화원에 많은 꿀벌들이 꿀을 모으고 있습니다.' },
    ],
  },
  '大象': {
    k: ['[명사] 코끼리.'],
    x: [
      { zh: '孩子们在动物园里看到了聪明的大象。', py: 'háizimen zài dòngwùyuán lǐ kàn dào le cōngmíng de dàxiàng。', ko: '아이들은 동물원에서 영리한 코끼리를 보았습니다.' },
    ],
  },
  '硬件': {
    k: ['[명사] 하드웨어 (컴퓨터 기계 설비).'],
    x: [
      { zh: '我们公司的计算机硬件需要全面升级了。', py: 'wǒmen gōngsī de jìsuànjī yìngjiàn xūyào quánmiàn shēngjí le。', ko: '우리 회사의 컴퓨터 하드웨어를 전면 업그레이드해야 합니다.' },
    ],
  },
  '明信片': {
    k: ['[명사] 우편엽서.'],
    x: [
      { zh: '我在北京旅游时给朋友寄了一张明信片。', py: 'wǒ zài běijīng lǚyóu shí gěi péngyou jì le yì zhāng míngxìnpiàn。', ko: '저는 베이징을 여행할 때 친구에게 엽서 한 장을 보냈습니다.' },
    ],
  },
  '动画片': {
    k: ['[명사] 만화영화. 애니메이션.'],
    x: [
      { zh: '小孩子都喜欢看幽默有趣的动画片。', py: 'xiǎoháizi dōu xǐhuan kàn yōumò yǒuqù de dònghuàpiàn。', ko: '아이들은 모두 유머러스하고 재미있는 만화영화를 좋아합니다.' },
    ],
  },
  '班主任': {
    k: ['[명사] 학급 담임선생님.'],
    x: [
      { zh: '张老师是我们班新来的班主任。', py: 'zhāng lǎoshī shì wǒmen bān xīn lái de bānzhǔrèn。', ko: '장 선생님은 우리 반에 새로 오신 담임선생님이십니다.' },
    ],
  },
  '橡皮': {
    k: ['[명사] 지우개. 고무.'],
    x: [
      { zh: '借我用一下你的橡皮好吗？', py: 'jiè wǒ yòng yíxià nǐ de xiàngpí hǎo ma？', ko: '네 지우개 좀 빌려 쓸 수 있을까?' },
      { zh: '铅笔后面有一块小橡皮。', py: 'qiānbǐ hòumiàn yǒu yí kuài xiǎo xiàngpí。', ko: '연필 뒤에 작은 지우개가 달려 있습니다.' },
    ],
  },
  '枪': {
    k: ['[명사] 총. 권총.', '[명사] 창 (무기).'],
    x: [
      { zh: '警察拔出枪制服了歹徒。', py: 'jǐngchá báchū qiāng zhìfú le dǎitú。', ko: '경찰이 총을 뽑아 범인을 제압했습니다.' },
    ],
  },
  '卷': {
    k: ['[명사] 시험지. 답안지.', '[양사] 권. 편.', '[동사] 말다. 둘둘 감다.'],
    x: [
      { zh: '考试结束了，请大家把试卷交上来。', py: 'kǎoshì jiéshù le, qǐng dàjiā bǎ shìjuàn jiāo shànglái。', ko: '시험이 끝났으니 모두 시험지를 제출해 주세요.' },
    ],
  },

  // HSK 6
  '州': {
    k: ['[명사] 주 (행정 구역). 자치주.'],
    x: [
      { zh: '苏州和杭州是中国著名的风景旅游城市。', py: 'sūzhōu hé hángzhōu shì zhōngguó zhùmíng de fēngjǐng lǚyóu chéngshì。', ko: '쑤저우와 항저우는 중국의 유명한 관광 도시입니다.' },
    ],
  },
  '夫人': {
    k: ['[명사] 부인. 사모님. 영부인.'],
    x: [
      { zh: '总统和夫人一起出席了国宴。', py: 'zǒngtǒng hé fūren yìqǐ chūxí le guóyàn。', ko: '대통령과 영부인이 함께 국빈 만찬에 참석했습니다.' },
    ],
  },
  '嗨': {
    k: ['[감탄사] 안녕. 야 (가볍게 부르거나 인사하는 소리).'],
    x: [
      { zh: '嗨！好久不见，你最近怎么样？', py: 'hāi！hǎojiǔ bú jiàn, nǐ zuìjìn zěnmeyàng？', ko: '하이! 오랜만이야, 요즘 어떻게 지내?' },
    ],
  },
  '图案': {
    k: ['[명사] 도안. 문양. 디자인.'],
    x: [
      { zh: '这件衣服上的传统图案非常精美。', py: 'zhè jiàn yīfu shang de chuántǒng tú’àn fēicháng jīngměi。', ko: '이 옷의 전통 문양이 매우 정교하고 아름답습니다.' },
    ],
  },
  '终止': {
    k: ['[동사] 종지부를 찍다. 중지하다. 종료하다.'],
    x: [
      { zh: '双方决定提前终止这项商业合同。', py: 'shuāngfāng juédìng tíqián zhōngzhǐ zhè xiàng shāngyè hétong。', ko: '양측은 상업 계약을 조기 종료하기로 결정했습니다.' },
    ],
  },
  '彩票': {
    k: ['[명사] 복권.'],
    x: [
      { zh: '他幸运地中了五百万元的彩票大奖。', py: 'tā xìngyùn de zhòng le wǔbǎi wàn yuán de cǎipiào dàjiǎng。', ko: '그는 운 좋게 500만 위안의 복권 1등에 당첨되었습니다.' },
    ],
  },
  '原告': {
    k: ['[명사] 원고 (소송을 제기한 사람).'],
    x: [
      { zh: '原告向法庭提交了强有力的证据。', py: 'yuángào xiàng fǎtíng tíjiāo le qiángyǒulì de zhèngjù。', ko: '원고는 법정에 강력한 증거를 제출했습니다.' },
    ],
  },
  '泡沫': {
    k: ['[명사] 거품. 포말. 버블 (경제).'],
    x: [
      { zh: '经济学者警告房地产市场存在巨大的泡沫。', py: 'jīngjì xuézhě jǐnggào fángdìchǎn shìchǎng cúnzài jùdà de pàomò。', ko: '경제학자들은 부동산 시장에 거대한 거품이 존재한다고 경고했습니다.' },
    ],
  },
  '城堡': {
    k: ['[명사] 성. 성채. 캐슬.'],
    x: [
      { zh: '山上有一座建于中世纪的古老城堡。', py: 'shān shang yǒu yí zuò jiàn yú zhōngshìjì de gǔlǎo chéngbǎo。', ko: '산 위에 중세에 지어진 오래된 성이 하나 있습니다.' },
    ],
  },
  '拾': {
    k: ['[수사] 열 (십 ‘十’의 갖은자).', '[동사] 줍다. 챙기다.'],
    x: [
      { zh: '在支票上，数字十常大写为‘拾’。', py: 'zài zhīpiào shang, shùzì shí cháng dàxiě wéi shí。', ko: '수표에서 숫자 10은 보통 갖은자인 ‘拾’으로 표기합니다.' },
    ],
  },
  '要不然': {
    k: ['[접속사] 그렇지 않으면. 안 그러면.'],
    x: [
      { zh: '我们得快点走，要不然就赶不上火车了。', py: 'wǒmen děi kuài diǎn zǒu, yàobùrán jiù gǎnbushàng huǒchē le。', ko: '우리는 서둘러야 해요. 안 그러면 기차를 놓칠 거예요.' },
    ],
  },
  '旋律': {
    k: ['[명사] 선율. 멜로디.'],
    x: [
      { zh: '这首乐曲的旋律优美动听，令人难忘。', py: 'zhè shǒu yuèqǔ de xuánlǜ yōuměi dòngtīng, lìng rén nánwàng。', ko: '이 악곡의 선율은 감미롭고 아름다워 잊기 어렵습니다.' },
    ],
  },
  '元首': {
    k: ['[명사] 국가 원수. 군주.'],
    x: [
      { zh: '多国国家元首齐聚北京参加国际峰会。', py: 'duō guó guójiā yuánshǒu qíjù běijīng cānjiā guójì fēnghuì。', ko: '여러 나라의 국가 원수들이 국제 정상회의에 참석하기 위해 베이징에 모였습니다.' },
    ],
  },
  '残留': {
    k: ['[동사] 잔류하다. 남아 있다.'],
    x: [
      { zh: '蔬菜在食用前应仔细清洗，以去除残留农药。', py: 'shūcài zài shíyòng qián yīng zǐxì qīngxǐ, yǐ qùchú cánliú nóngyào。', ko: '채소는 잔류 농약을 제거하기 위해 섭취 전 꼼꼼히 씻어야 합니다.' },
    ],
  },
  '绅士': {
    k: ['[명사] 신사 (예의 바른 남성). 세도가.'],
    x: [
      { zh: '他的举止非常绅士，深受大家的尊敬。', py: 'tā de jǔzhǐ fēicháng shēnshì, shēnshòu dàjiā de zūnjìng。', ko: '그의 행동거지는 매우 신사다워서 모두의 존경을 받습니다.' },
    ],
  },
  '平面': {
    k: ['[명사] 평면.'],
    x: [
      { zh: '设计师展示了新建筑的平面设计图。', py: 'shèjìshī zhǎnshì le xīn jiànzhù de píngmiàn shèjìtú。', ko: '디자이너가 신축 건물의 평면 설계도를 보여주었습니다.' },
    ],
  },
  '往常': {
    k: ['[명사] 평소. 평상시. 여느 때.'],
    x: [
      { zh: '他今天比往常起得更早一些。', py: 'tā jīntiān bǐ wǎngcháng qǐ de gèng zǎo yìxiē。', ko: '그는 오늘 평소보다 조금 더 일찍 일어났습니다.' },
    ],
  },
  '壮观': {
    k: ['[형용사,명사] 장관이다. 웅장하다.'],
    x: [
      { zh: '黄果树瀑布从高处飞泻而下，景象十分壮观。', py: 'huángguǒshù pùbù cóng gāochù fēixiè ér xià, jǐngxiàng shífēn zhuàngguān。', ko: '황궈수 폭포가 높은 곳에서 쏟아져 내리는 모습이 매우 장관입니다.' },
    ],
  },
  '要素': {
    k: ['[명사] 요소. 요인.'],
    x: [
      { zh: '坚持和创新是取得成功不可或缺的要素。', py: 'jiānchí hé chuàngxīn shì qǔdé chénggōng bùkě huòquē de yàosù。', ko: '끈기와 혁신은 성공을 이루는 데 없어서는 안 될 요소입니다.' },
    ],
  },
  '备忘录': {
    k: ['[명사] 비망록. 양해각서(MOU). 메모.'],
    x: [
      { zh: '两国代表签署了关于经贸合作的备忘录。', py: 'liǎng guó dàibiǎo qiānshǔ le guānyú jīngmào hézuò de bèiwànglù。', ko: '양국 대표는 경제 무역 협력에 관한 양해각서를 체결했습니다.' },
    ],
  },
  '小心翼翼': {
    k: ['[사자성어] 조심조심하다. 극히 신중하고 조심스럽다.'],
    x: [
      { zh: '他小心翼翼地捧着珍贵的古董花瓶。', py: 'tā xiǎoxīnyìyì de pěng zhe zhēnguì de gǔdǒng huāpíng。', ko: '그는 귀중한 골동품 꽃병을 조심스럽게 받쳐 들었습니다.' },
    ],
  },
  '橙': {
    k: ['[명사] 오렌지. 등자.', '[명사] 주황색. 오렌지색.'],
    x: [
      { zh: '橙子富含维生素C，味道酸甜可口。', py: 'chéngzi fùhán wéishēngsù C, wèidao suāntián kěkǒu。', ko: '오렌지는 비타민 C가 풍부하며 새콤달콤 맛있습니다.' },
    ],
  },
  '凝视': {
    k: ['[동사] 응시하다. 뚫어지게 바라보다. 눈여겨보다.'],
    x: [
      { zh: '他站在窗前，深情地凝视着远方的星空。', py: 'tā zhàn zài chuāng qián, shēnqíng de níngshì zhe yuǎnfāng de xīngkōng。', ko: '그는 창가에 서서 먼 밤하늘의 별을 그윽하게 응시했습니다.' },
    ],
  },
  '微不足道': {
    k: ['[사자성어] 하찮아서 말할 가치도 없다. 보잘것없다.'],
    x: [
      { zh: '这点微不足道的帮助，你不用一直放在心上。', py: 'zhè diǎn wēibùzúdào de bāngzhù, nǐ búyòng yìzhí fàng zài xīinshang。', ko: '이 정도의 보잘것없는 도움은 마음에 담아두지 않으셔도 됩니다.' },
    ],
  },
  '胸膛': {
    k: ['[명사] 가슴. 흉부.'],
    x: [
      { zh: '他挺起胸膛，勇敢地面迎前方的挑战。', py: 'tā tǐngqǐ xiōngtáng, yǒnggǎn de miànyíng qiánfāng de tiǎozhàn。', ko: '그는 가슴을 펴고 용감하게 앞의 도전에 맞섰습니다.' },
    ],
  },
  '当务之急': {
    k: ['[사자성어] 당면한 급선무. 당장 급한 일.'],
    x: [
      { zh: '拯救受灾群众是目前救援工作的当务之急。', py: 'zhěngjiù shòuzāi qúnzhòng shì mùqián jiùyuán gōngzuò de dāngwùzhījī。', ko: '재해를 입은 주민들을 구출하는 것이 현재 구호 작업의 급선무입니다.' },
    ],
  },
  '书法': {
    k: ['[명사] 서예. 서도(書道). 글씨체.'],
    x: [
      { zh: '练习中国书法不仅能修身养性，还能提高审美。', py: 'liànxí zhōngguó shūfǎ bùjǐn néng xiūshēnyǎngxìng, hái néng tígāo shěnměi。', ko: '중국 서예를 연습하면 심신을 수양할 뿐만 아니라 미적 감각도 높일 수 있습니다.' },
    ],
  },
  '运算': {
    k: ['[동사,명사] 연산(하다). 계산(하다).'],
    x: [
      { zh: '超级计算机每秒能进行数十亿次复杂的数学运算。', py: 'chāojí jìsuànjī měi miǎo néng jìnxíng shù shí yì cì fùzá de shùxué yùnsuàn。', ko: '슈퍼컴퓨터는 초당 수십억 번의 복잡한 수학 연산을 수행할 수 있습니다.' },
    ],
  },
  '肖像': {
    k: ['[명사] 초상화. 인물 사진.'],
    x: [
      { zh: '这幅达芬奇的名作是世界上最著名的肖像画之一。', py: 'zhè fú dáfēnqí de míngzuò shì shìjiè shang zuì zhùmíng de xiàoxiànghuà zhīyī。', ko: '다빈치의 이 명작은 세계에서 가장 유명한 초상화 중 하나입니다.' },
    ],
  },
  '冰雹': {
    k: ['[명사] 우박.'],
    x: [
      { zh: '昨天突降一场冰雹，给当地农业造成了损失。', py: 'zuótiān tū jiàng yì cháng bīngbáo, gěi dāngdì nóngyè zàochéng le sǔnshī。', ko: '어제 갑자기 우박이 쏟아져 현지 농업에 피해를 입혔습니다.' },
    ],
  },
  '诬陷': {
    k: ['[동사] 모함하다. 무함하다. 없는 죄를 덮어씌우다.'],
    x: [
      { zh: '法律绝不允许任何人捏造事实诬陷他人。', py: 'fǎlǜ jué bù yǔnxǔ rènhé rén niēzào shìshí wūxiàn tārén。', ko: '법은 그 누구도 사실을 날조하여 타인을 모함하는 것을 허용하지 않습니다.' },
    ],
  },
  '供不应求': {
    k: ['[사자성어] 공급이 수요를 따르지 못하다. 물건이 모자라다.'],
    x: [
      { zh: '这款新手机上市后非常受欢迎，一度供不应求。', py: 'zhè kuǎn xīn shǒujī shàngshì hòu fēicháng shòu huānyíng, yídù gōngbùyìngqiú。', ko: '이 신형 스마트폰은 출시 후 큰 인기를 끌어 한동안 공급이 수요를 따르지 못했습니다.' },
    ],
  },
  '哺乳': {
    k: ['[동사] 젖을 먹이다. 포유하다.'],
    x: [
      { zh: '鲸鱼和海豚虽然生活在水里，但都是哺乳动物。', py: 'jīngyú hé hǎitún suīrán shēnghuó zài shuǐ lǐ, dàn dōu shì bǔrǔ dòngwù。', ko: '고래와 돌고래는 비록 물속에 살지만 모두 포유류 동물입니다.' },
    ],
  },
  '循序渐进': {
    k: ['[사자성어] 순서에 따라 점진적으로 나아가다. 차근차근 배우다.'],
    x: [
      { zh: '学习外语需要循序渐进，不能急于求成。', py: 'xuéxí wàiyǔ xūyào xúnxùjiànjìn, bùnéng jíyúqiúchéng。', ko: '외국어 학습은 차근차근 단계를 밟아야지 조급하게 결과를 바라면 안 됩니다.' },
    ],
  },
  '安居乐业': {
    k: ['[사자성어] 안정되게 살며 즐겁게 일하다. 태평성대를 누리다.'],
    x: [
      { zh: '社会稳定才能让广大人民群众安居乐业。', py: 'shèhuì wěndìng cái néng ràng guǎngdà rénmín qúnzhòng ānjūlèyè。', ko: '사회가 안정되어야 모든 국민이 편안하게 살며 즐겁게 일할 수 있습니다.' },
    ],
  },
  '无可奉告': {
    k: ['[사자성어] 알려드릴 말씀이 없다. 노코멘트.'],
    x: [
      { zh: '关于案件的具体细节，警方表示无可奉告。', py: 'guānyú ànjiàn de jùtǐ xìjié, jǐngfāng biǎoshì wúkěfènggào。', ko: '사건의 구체적인 세부 사항에 대해 경찰은 노코멘트라고 밝혔습니다.' },
    ],
  },
  '序言': {
    k: ['[명사] 서문. 머리말. 서언.'],
    x: [
      { zh: '作者在序言中详细阐述了撰写本书的初衷。', py: 'zuòzhě zài xùyán zhōng xiángxì chǎnshù le zhuànxiě běnshū de chūzhōng。', ko: '저자는 머리말에서 이 책을 집필하게 된 계기를 상세히 밝혔습니다.' },
    ],
  },
  '旗袍': {
    k: ['[명사] 치파오 (중국 전통 여성 의상).'],
    x: [
      { zh: '她身穿一袭红色的传统旗袍，显得端庄典雅。', py: 'tā shēn chuān yì xí hóngsè de chuántǒng qípáo, xiǎnde duānzhuāng diǎnyǎ。', ko: '그녀는 붉은색 전통 치파오를 입어 단아하고 우아해 보였습니다.' },
    ],
  },
  '风土人情': {
    k: ['[사자성어] 각 지방의 풍토와 인심. 지역 고유의 풍습.'],
    x: [
      { zh: '旅行不仅能欣赏美景，还能体验各地的风土人情。', py: 'lǚxíng bùjǐn néng xīnshǎng měijǐng, hái néng tǐyàn gèdì de fēngtǔrénqíng。', ko: '여행은 아름다운 경치를 감상할 수 있을 뿐만 아니라 각지의 풍토와 인심을 체험할 수 있습니다.' },
    ],
  },
  '繁体字': {
    k: ['[명사] 번체자 (간화되기 이전의 전통 한자).'],
    x: [
      { zh: '香港和台湾地区目前依然通用繁体字。', py: 'xiānggǎng hé táiwān dìqū mùqián yīrán tōngyòng fántǐzì。', ko: '홍콩과 대만 지역에서는 현재도 여전히 번체자를 통용합니다.' },
    ],
  },
  '通货': {
    k: ['[명사] 통화 (유통 화폐).'],
    x: [
      { zh: '通货膨胀会导致物价普遍上涨和货币贬值。', py: 'tōnghuò péngzhàng huì dǎozhì wùjià pǔbiàn shàngzhǎng hé huòbì biǎnzhí。', ko: '인플레이션(통화 팽창)은 전반적인 물가 상승과 화폐 가치 하락을 초래합니다.' },
    ],
  },
  '糖葫芦': {
    k: ['[명사] 탕후루 (과일에 설탕물을 입힌 중국 전통 간식).'],
    x: [
      { zh: '冬天在北京街头吃一串冰糖葫芦是很多人的美好记忆。', py: 'dōngtiān zài běijīng jiētóu chī yí chuàn bīngtánghúlu shì hěn duō rén de měihǎo jìyì。', ko: '겨울철 베이징 거리에서 탕후루 한 꼬치를 먹는 것은 많은 이들의 아름다운 추억입니다.' },
    ],
  },
  '重阳节': {
    k: ['[명사] 중양절 (음력 9월 9일, 높은 곳에 오르고 어르신을 공경하는 중국 명절).'],
    x: [
      { zh: '每年农历九月初九是中国的传统重阳节，有登高敬老的习俗。', py: 'měinián nónglì jiǔyuè chūjiǔ shì zhōngguó de chuántǒng chóngyángjié, yǒu dēnggāo jìnglǎo de xísú。', ko: '매년 음력 9월 9일은 중국의 전통 중양절로, 높은 곳에 오르고 웃어른을 공경하는 풍습이 있습니다.' },
    ],
  },
};

async function applyFixes() {
  console.log('=== 누락 단어 전체 데이터 주입 시작 ===\n');

  for (let lv = 1; lv <= 6; lv++) {
    const filePath = join(KO_DATA, `hsk${lv}.json`);
    const koData = JSON.parse(await readFile(filePath, 'utf-8'));
    let updatedCount = 0;

    for (const [word, info] of Object.entries(SUPPLEMENTARY_DATA)) {
      if (koData[word]) {
        koData[word] = {
          ...koData[word],
          k: info.k || koData[word].k,
          x: info.x || koData[word].x,
          s: koData[word].s || '표준 HSK 학습사전',
        };
        updatedCount++;
      }
    }

    await writeFile(filePath, JSON.stringify(koData, null, 2), 'utf-8');
    console.log(`[HSK ${lv}급] ${updatedCount}개 단어 정보 완벽 보강 완료`);
  }
}

applyFixes();
