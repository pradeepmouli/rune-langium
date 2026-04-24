import { h } from 'vue';
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import RuneHome from './components/RuneHome.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      // Replace VitePress's default home hero chrome with our themed pieces.
      // `home-hero-info-before` renders the mono label above the hero title;
      // `home-hero-image` renders the teal R mark on the right. The rest of
      // the hero styling (gradients, typography, spacing) comes from
      // custom.css overrides scoped to VitePress's own `.VPHome` classes.
      'home-hero-info-before': () => h(RuneHome, { slot: 'label' }),
      'home-hero-image': () => h(RuneHome, { slot: 'visual' })
    })
} satisfies Theme;
