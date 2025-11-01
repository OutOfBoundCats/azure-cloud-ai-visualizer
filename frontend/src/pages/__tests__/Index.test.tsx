import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Index from '@/pages/Index';

vi.mock('@/context/SupabaseContext', () => {
  return {
    useSupabase: () => ({
      isReady: true,
      user: null,
      supabaseAvailable: false,
      client: undefined,
      signInWithProvider: vi.fn(),
      signOut: vi.fn(),
    }),
  };
});

vi.mock('@/services/projectService', () => ({
  createProjectWithPrompt: vi.fn(),
  listRecentProjects: vi.fn().mockResolvedValue([]),
}));

let canvasContextSpy: ReturnType<typeof vi.spyOn> | undefined;

beforeAll(() => {
  canvasContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
});

afterAll(() => {
  canvasContextSpy?.mockRestore();
});
describe('Index landing page', () => {
  it('renders hero content and prompt textarea', () => {
    render(
      <MemoryRouter>
        <Index />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 2, name: /Build something/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('allows typing into prompt textarea', async () => {
    render(
      <MemoryRouter>
        <Index />
      </MemoryRouter>
    );

    const textarea = screen.getByRole('textbox');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'Design a secure Azure landing zone for a fintech startup');

    expect(
      screen.getByDisplayValue('Design a secure Azure landing zone for a fintech startup')
    ).toBeInTheDocument();
  });
});
