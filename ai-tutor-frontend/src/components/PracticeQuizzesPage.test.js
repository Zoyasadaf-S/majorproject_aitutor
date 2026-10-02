import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PracticeQuizzesPage from './PracticeQuizzesPage';

const questions = [
  {
    question: 'What is printed?\n\n```python\nfor i in range(3):\n    if i == 1:\n        print(i)\n```',
    options: ['0', '1', '2', 'None'].map((text, index) => ({ id: 'ABCD'[index], text })),
    correct_id: 'B',
    explanation: 'The loop checks each value.\n\n1. It skips 0.\n2. It prints 1.'
  },
  {
    question: 'What does this Java code do?\n\n```java\nif (ready) {\n    start();\n    finish();\n}\n```',
    options: ['Starts', 'Stops', 'Both', 'Neither'].map((text, index) => ({ id: 'ABCD'[index], text })),
    correct_id: 'C', explanation: 'Both statements run.'
  },
  {
    question: 'Consider these points:\n1. First paragraph.\n\n2. Second paragraph.',
    options: ['A', 'B', 'C', 'D'].map((text, index) => ({ id: 'ABCD'[index], text })),
    correct_id: 'A', explanation: 'Two points.\n\nThey are separate.'
  },
  {
    question: 'If x = 2, what is x² + 3?',
    options: ['5', '7', '8', '9'].map((text, index) => ({ id: 'ABCD'[index], text })),
    correct_id: 'B', explanation: '2² + 3 = 7.'
  },
  {
    question: 'Final question?',
    options: ['Yes', 'No', 'Maybe', 'N/A'].map((text, index) => ({ id: 'ABCD'[index], text })),
    correct_id: 'A', explanation: 'Final explanation.'
  }
];

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => questions })
    .mockResolvedValue({ ok: true, json: async () => ({}) });
});

test('preserves quiz code, text, math and explanations through final review', async () => {
  render(<PracticeQuizzesPage onPracticeCompleted={jest.fn()} />);
  fireEvent.change(screen.getByPlaceholderText(/enter a topic/i), { target: { value: 'Loops' } });
  fireEvent.click(screen.getByText('START 5-QUESTION QUIZ'));

  const python = await screen.findByText(/for i in range/);
  expect(python.closest('pre')).toHaveTextContent('for i in range(3):');
  expect(python.closest('pre').textContent).toContain('\n    if i == 1:');
  for (let index = 0; index < questions.length; index += 1) {
    fireEvent.click(document.querySelector('.quiz-option-content').closest('button'));
    expect(screen.getByText(/Explanation:/)).toBeInTheDocument();
    if (index === 0) expect(screen.getByText(/1\. It skips 0\./)).toBeInTheDocument();
    fireEvent.click(screen.getByText(index === 4 ? 'Finish Quiz' : 'Next Question'));
    if (index < questions.length - 1) await waitFor(() => expect(screen.getByText(new RegExp(`Question ${index + 2} of 5`))).toBeInTheDocument());
  }

  expect(await screen.findByText('Detailed Question Review:')).toBeInTheDocument();
  expect(screen.getByText(/if \(ready\)/)).toBeInTheDocument();
  expect(screen.getByText(/They are separate\./)).toBeInTheDocument();
  expect(screen.getByText('Final explanation.')).toBeInTheDocument();
});
