import type { Meta, StoryObj } from '@storybook/react';
import { marketFixture } from '../../../.storybook/marketFixture';
import { MarketCard } from './MarketCard';

const meta = {
  title: 'Components/Card/MarketCard',
  component: MarketCard,
  args: { market: marketFixture },
  parameters: {
    docs: {
      description: {
        component: 'Market card with status, fight details, pooled volume, and odds.',
      },
    },
  },
} satisfies Meta<typeof MarketCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NewMarket: Story = { args: { isNew: true } };
export const Resolved: Story = {
  args: { market: { ...marketFixture, status: 'resolved', outcome: 'fighter_a' } },
};
export const NoBets: Story = {
  args: {
    market: { ...marketFixture, pool_a: '0', pool_b: '0', pool_draw: '0', total_pool: '0' },
  },
};
