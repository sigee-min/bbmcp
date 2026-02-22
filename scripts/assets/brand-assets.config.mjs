const FAVICON_PNG_SIZES = [16, 24, 32, 48, 64, 96, 128, 180, 192, 512];
const BRAND_THEME_VARIANTS = ['light', 'dark'];

export const brandAssetConfig = {
  imagesRoot: 'images',
  sourceAssets: {
    logo: 'images/logo.png',
    logoFullBackground: 'images/logo_fullbackground.png'
  },
  favicon: {
    outputDir: 'images/favicons',
    baseName: 'favicon',
    icoSize: 256,
    pngSizes: FAVICON_PNG_SIZES,
    defaultThemeVariant: 'light'
  },
  logoThemeTargets: {
    logo: {
      light: 'images/logo_light.png',
      dark: 'images/logo_dark.png'
    },
    logoFullBackground: {
      light: 'images/logo_fullbackground_light.png',
      dark: 'images/logo_fullbackground_dark.png'
    }
  },
  colorTransform: {
    formula: 'hsl-complement',
    darkVariantOptions: {
      invertLightness: true
    }
  },
  themeVariants: BRAND_THEME_VARIANTS
};

const toPosixPath = (value) => value.replace(/\\/g, '/');
const trimTrailingSlash = (value) => value.replace(/\/+$/, '');

const resolveFaviconDir = () => trimTrailingSlash(toPosixPath(brandAssetConfig.favicon.outputDir));

export const buildFaviconPngPath = ({ size, theme = null }) => {
  const suffix = theme ? `-${theme}` : '';
  return `${resolveFaviconDir()}/${brandAssetConfig.favicon.baseName}-${size}x${size}${suffix}.png`;
};

export const buildFaviconIcoPath = ({ theme = null } = {}) => {
  const suffix = theme ? `-${theme}` : '';
  return `${resolveFaviconDir()}/${brandAssetConfig.favicon.baseName}${suffix}.ico`;
};

export const buildFaviconArtifactSpecs = ({ includeThemeVariants = false, includeBaseSet = true } = {}) => {
  const variants = [];
  if (includeThemeVariants) {
    variants.push(...brandAssetConfig.themeVariants);
  }
  if (includeBaseSet) {
    variants.push(null);
  }
  const specs = [];
  for (const variant of variants) {
    for (const size of brandAssetConfig.favicon.pngSizes) {
      specs.push({
        type: 'png',
        size,
        theme: variant,
        target: buildFaviconPngPath({ size, theme: variant })
      });
    }
    specs.push({
      type: 'ico',
      size: brandAssetConfig.favicon.icoSize,
      theme: variant,
      target: buildFaviconIcoPath({ theme: variant })
    });
  }
  return specs;
};

export const getBrandThemeLogoTargets = () => [
  brandAssetConfig.logoThemeTargets.logo.light,
  brandAssetConfig.logoThemeTargets.logo.dark,
  brandAssetConfig.logoThemeTargets.logoFullBackground.light,
  brandAssetConfig.logoThemeTargets.logoFullBackground.dark
];

export const forbiddenLegacyBrandAssets = [
  'images/logo-32.png',
  'images/logo-180.png',
  'images/logo-192.png',
  'images/logo-256.png',
  'images/logo-512.png',
  'images/apple-touch-icon.png',
  'images/android-chrome-192x192.png',
  'images/android-chrome-512x512.png',
  'images/assets/images/ashfox.png'
];

const rootFaviconPattern = /^images\/favicon(?:-[^/]+)?\.(?:png|ico)$/;

export const isRootFaviconArtifact = (filePath) => rootFaviconPattern.test(toPosixPath(filePath));

export const getAllowedRootFaviconArtifacts = ({ includeThemeVariants = false } = {}) => {
  if (resolveFaviconDir() !== 'images') {
    return [];
  }
  return buildFaviconArtifactSpecs({ includeThemeVariants }).map((spec) => spec.target);
};
