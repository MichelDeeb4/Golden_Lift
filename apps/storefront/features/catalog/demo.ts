import { ApiError } from '@business-platform/api';
import type {
  CatalogDataSource,
  Category,
  Product,
  ProductQuery,
  Language,
  MediaReference,
  MediaResolver,
  CatalogPage,
} from '@business-platform/api';
type Localized = Record<Language, string>;
const text = (ar: string, en: string, ckb: string): Localized => ({ ar, en, ckb });
const categoryRecords = [
  {
    id: 'cabins',
    parentId: null,
    name: text('المقصورات', 'Elevator cabins', 'کابینەی ئاسانسۆر'),
    description: text(
      'تفاصيل معمارية للمساحات الداخلية',
      'Architectural details for interior spaces',
      'وردەکاری تەلارسازی بۆ ناوەوە',
    ),
    image: 'cabin',
  },
  {
    id: 'doors',
    parentId: null,
    name: text('الأبواب', 'Elevator doors', 'دەرگای ئاسانسۆر'),
    description: text(
      'أنظمة دخول بأشكال هادئة',
      'Entrance systems with considered forms',
      'سیستەمی چوونەژوورەوە بە شێوەی ورد',
    ),
    image: 'door',
  },
  {
    id: 'systems',
    parentId: null,
    name: text('الأنظمة والمكونات', 'Systems & components', 'سیستەم و پێکهاتەکان'),
    description: text(
      'اكتشف مكونات النظام',
      'Discover the system components',
      'پێکهاتەکانی سیستەم بدۆزەوە',
    ),
    image: 'machine',
  },
  {
    id: 'machines',
    parentId: 'systems',
    name: text('آلات الجر', 'Traction machines', 'ئامێری ڕاکێشان'),
    description: null,
    image: 'machine',
  },
  {
    id: 'controllers',
    parentId: 'systems',
    name: text('أنظمة التحكم', 'Control systems', 'سیستەمی کۆنترۆڵ'),
    description: null,
    image: 'controller',
  },
];
const attribute = (id: string, label: Localized, value: Localized, unit: string | null = null) => ({
  id,
  label,
  value,
  unit,
});
const records = [
  {
    id: 'aurum-01',
    categoryId: 'cabins',
    name: text('مقصورة أوروم', 'Aurum cabin', 'کابینەی ئاوروم'),
    model: 'GL–C01',
    image: 'cabin',
    description: text(
      'نموذج توضيحي يجمع الأسطح المعدنية الدافئة والإضاءة الهادئة. المواصفات أدناه بيانات تجريبية للتصميم.',
      'An illustrative cabin pairing warm metal surfaces with calm lighting. Specifications below are design-preview data.',
      'کابینەیەکی نموونەیی بە ڕووکاری مەعدەنی گەرم و ڕووناکی ئارام. تایبەتمەندییەکان داتای پێشبینینن.',
    ),
    attrs: [
      attribute(
        'material',
        text('السطح', 'Surface', 'ڕووکار'),
        text('برونز مصقول', 'Brushed bronze', 'برۆنزی برسەکراو'),
      ),
      attribute('lighting', text('الإضاءة', 'Lighting', 'ڕووناکی'), text('خطية', 'Linear', 'هێڵی')),
      attribute(
        'capacity',
        text('السعة التوضيحية', 'Illustrative capacity', 'توانای نموونەیی'),
        text('630', '630', '630'),
        'kg',
      ),
    ],
  },
  {
    id: 'linea-02',
    categoryId: 'doors',
    name: text('باب لينيا', 'Linea door', 'دەرگای لینیا'),
    model: 'GL–D02',
    image: 'door',
    description: text(
      'نموذج باب معدني بتفاصيل خطية واضحة، مع بيانات مواصفات توضيحية.',
      'An illustrative metal entrance with precise linear detailing and sample specifications.',
      'دەرگایەکی مەعدەنی نموونەیی بە وردەکاری هێڵی و تایبەتمەندی نموونەیی.',
    ),
    attrs: [
      attribute(
        'material',
        text('السطح', 'Surface', 'ڕووکار'),
        text('فولاذ مصقول', 'Brushed steel', 'پۆڵای برسەکراو'),
      ),
      attribute(
        'opening',
        text('الفتح', 'Opening', 'کردنەوە'),
        text('مركزي', 'Center opening', 'ناوەندی'),
      ),
    ],
  },
  {
    id: 'drive-03',
    categoryId: 'machines',
    name: text('آلة الجر دايركت', 'Direct traction machine', 'ئامێری ڕاکێشانی دایرێکت'),
    model: 'GL–M03',
    image: 'machine',
    description: text(
      'تمثيل توضيحي لمكون تقني ضمن الكتالوج التجريبي.',
      'An illustrative technical component in the preview collection.',
      'پێکهاتەیەکی تەکنیکی نموونەیی لە کۆمەڵەی پێشبینین.',
    ),
    attrs: [
      attribute(
        'design',
        text('التصميم', 'Design', 'دیزاین'),
        text('بدون تروس', 'Gearless', 'بێ ددانە'),
      ),
      attribute(
        'power',
        text('قدرة توضيحية', 'Illustrative power', 'توانای نموونەیی'),
        text('7.5', '7.5', '7.5'),
        'kW',
      ),
    ],
  },
  {
    id: 'silver-04',
    categoryId: 'cabins',
    name: text('مقصورة سيلفر', 'Silver cabin', 'کابینەی سیلڤەر'),
    model: 'GL–C04',
    image: 'silver',
    description: text(
      'نموذج توضيحي بأسطح فضية وتفاصيل هندسية هادئة.',
      'An illustrative silver interior with calm architectural details.',
      'ناوەوەیەکی زیوی نموونەیی بە وردەکاری ئارامی تەلارسازی.',
    ),
    attrs: [
      attribute(
        'material',
        text('السطح', 'Surface', 'ڕووکار'),
        text('فولاذ مصقول', 'Brushed steel', 'پۆڵای برسەکراو'),
      ),
      attribute(
        'lighting',
        text('الإضاءة', 'Lighting', 'ڕووناکی'),
        text('محيطية', 'Ambient', 'دەوروبەری'),
      ),
    ],
  },
  {
    id: 'control-05',
    categoryId: 'controllers',
    name: text('وحدة التحكم بريسيجن', 'Precision controller', 'کۆنترۆڵەری پریسیژن'),
    model: 'GL–S05',
    image: 'controller',
    description: text(
      'تمثيل توضيحي لنظام التحكم مع حقول تقنية منظمة.',
      'An illustrative control system with structured technical fields.',
      'سیستەمێکی کۆنترۆڵی نموونەیی بە خانەی تەکنیکی ڕێکخراو.',
    ),
    attrs: [
      attribute(
        'control',
        text('التحكم', 'Control', 'کۆنترۆڵ'),
        text('رقمي', 'Digital', 'دیجیتاڵ'),
      ),
      attribute(
        'installation',
        text('التركيب', 'Installation', 'دامەزراندن'),
        text('داخل الخزانة', 'Cabinet-mounted', 'لە ناو کابینەت'),
      ),
    ],
  },
];
const media = (
  id: string,
  image: string,
  alt: string,
  ownerId: string,
  ownerType: 'PRODUCT' | 'CATEGORY' = 'PRODUCT',
): MediaReference => ({
  id,
  kind: 'image',
  alt,
  profile: 'detail',
  ownerType,
  ownerId,
  demoUrl: '/demo/' + image + '.svg',
  mime: 'image/svg+xml',
});
export class DemoCatalogDataSource implements CatalogDataSource {
  readonly identity = 'demo';
  readonly demo = true;
  async categories(
    language: Language,
    parentId: string | null,
    _signal?: AbortSignal,
  ): Promise<CatalogPage<Category>> {
    return {
      items: categoryRecords
        .filter((c) => c.parentId === parentId)
        .map((c) => ({
          id: c.id,
          parentId: c.parentId,
          name: c.name[language],
          description: c.description?.[language] ?? null,
          image: media(c.id, c.image, c.name[language], c.id, 'CATEGORY'),
        })),
      total: null,
      nextCursor: null,
    };
  }
  async category(id: string, language: Language) {
    const c = categoryRecords.find((c) => c.id === id);
    if (!c) throw new ApiError('not-found', 404);
    return {
      id: c.id,
      parentId: c.parentId,
      name: c.name[language],
      description: c.description?.[language] ?? null,
      image: media(c.id, c.image, c.name[language], c.id, 'CATEGORY'),
    };
  }
  private model(r: (typeof records)[number], l: Language): Product {
    const category = categoryRecords.find((c) => c.id === r.categoryId)!;
    return {
      id: r.id,
      categoryId: r.categoryId,
      name: r.name[l],
      description: r.description[l],
      model: r.model,
      categoryName: category.name[l],
      media: [
        media(r.id + '-cover', r.image, r.name[l], r.id),
        media(r.id + '-detail', r.image === 'cabin' ? 'silver' : r.image, r.name[l], r.id),
      ],
      attributes: r.attrs.map((a) => ({
        id: a.id,
        label: a.label[l],
        value: a.value[l],
        unit: a.unit,
      })),
      documents:
        r.id === 'aurum-01'
          ? [
              {
                id: 'demo-sheet',
                title: text(
                  'ورقة مواصفات توضيحية',
                  'Illustrative specification sheet',
                  'پەڕەی تایبەتمەندیی نموونەیی',
                )[l],
                type: 'PDF · Demo',
                permitted: true,
                media: {
                  id: 'demo-sheet',
                  kind: 'document',
                  alt: 'Demo',
                  profile: 'original',
                  ownerType: 'TECHNICAL_SOURCE',
                  ownerId: r.id,
                  demoUrl: '/demo/specification.pdf',
                  mime: 'application/pdf',
                },
              },
            ]
          : [],
    };
  }
  async products(language: Language, q: ProductQuery): Promise<CatalogPage<Product>> {
    let rows = records.filter(
      (r) =>
        (!q.categoryId || r.categoryId === q.categoryId) &&
        (!q.text ||
          (r.name[language] + ' ' + r.model)
            .toLocaleLowerCase()
            .includes(q.text.toLocaleLowerCase())),
    );
    if (q.sort === 'name')
      rows = rows.toSorted((a, b) => a.name[language].localeCompare(b.name[language], language));
    const page = q.page ?? 1;
    return {
      items: rows
        .slice((page - 1) * (q.pageSize ?? 12), page * (q.pageSize ?? 12))
        .map((r) => this.model(r, language)),
      total: rows.length,
      nextCursor: null,
    };
  }
  async product(id: string, language: Language) {
    const r = records.find((p) => p.id === id);
    if (!r) throw new ApiError('not-found', 404);
    return this.model(r, language);
  }
}
export class DemoMediaResolver implements MediaResolver {
  async resolve(r: MediaReference) {
    if (!r.demoUrl || !/^\/demo\/[a-z0-9-]+\.(svg|pdf)$/.test(r.demoUrl))
      throw new ApiError('invalid');
    return { url: r.demoUrl, expiresAt: null };
  }
}
