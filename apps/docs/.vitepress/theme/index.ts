import { h } from 'vue';
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import RuneHome from './components/RuneHome.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      // Replace VitePress's default home content with our themed hero.
      // Uses `home-features-after` + full hero override via CSS scope hook on `.VPHome`.
      'home-hero-info-before': () => h(RuneHome, { slot: 'label' }),
      'home-hero-image': () => h(RuneHome, { slot: 'visual' })
    })
} satisfies Theme;
