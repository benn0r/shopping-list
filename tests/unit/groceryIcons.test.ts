import { groceryIconForLabel } from '../../src/services/groceryIcons';

describe('grocery icon matching', () => {
  it.each([
    ['en', 'Bread rolls'],
    ['de', 'Frische Brötchen'],
    ['fr', 'Deux petits pains'],
    ['it', 'Panini integrali'],
    ['pt', 'Pães frescos'],
    ['pt-BR', 'Pãozinho integral'],
  ])('matches bread in %s', (_language, label) => {
    expect(groceryIconForLabel(label)).toBeDefined();
  });

  it.each([
    'Äpfel',
    'Jus de pomme',
    'Succo di arancia',
    'Água com gás',
    'Leite de aveia',
    'Pommes de terre',
    'Cogumelos frescos',
    'Frigideira',
    'Essuie-tout',
    'Bebida energética',
  ])('matches normalized multilingual label %s', (label) => {
    expect(groceryIconForLabel(label)).toBeDefined();
  });

  it('prefers a specific phrase over a generic ingredient', () => {
    expect(groceryIconForLabel('Orange juice')).not.toEqual(groceryIconForLabel('Orange'));
    expect(groceryIconForLabel('Sparkling water')).not.toEqual(groceryIconForLabel('Water'));
  });

  it('does not match partial words or unknown products', () => {
    expect(groceryIconForLabel('')).toBeUndefined();
    expect(groceryIconForLabel('Teapot')).toBeUndefined();
    expect(groceryIconForLabel('Mystery galaxy supplies')).toBeUndefined();
  });
});
