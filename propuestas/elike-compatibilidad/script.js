const tabButtons = document.querySelectorAll("[data-tab]");
const panels = document.querySelectorAll("[data-panel]");

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.tab;

    tabButtons.forEach((item) => item.classList.toggle("active", item === button));
    panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === target));
  });
});

const questions = [
  {
    label: "Paso 1 de 4",
    question: "¿De qué material es tu puerta?",
    options: ["Madera", "Metal", "Aluminio", "Vidrio", "Otro"],
  },
  {
    label: "Paso 2 de 4",
    question: "¿Qué espesor aproximado tiene?",
    options: ["Menos de 30 mm", "30 a 70 mm", "Más de 70 mm", "No lo sé"],
  },
  {
    label: "Paso 3 de 4",
    question: "¿Tu puerta tiene marco angosto?",
    options: ["Sí", "No", "No estoy seguro"],
  },
  {
    label: "Paso 4 de 4",
    question: "¿Necesitás acceso remoto mediante Wi-Fi?",
    options: ["Sí, desde el celular", "No es prioritario", "Quiero comparar opciones"],
  },
];

const state = {
  current: 0,
  answers: new Array(questions.length).fill(null),
};

const stepLabel = document.querySelector("[data-step-label]");
const questionText = document.querySelector("[data-question]");
const optionsNode = document.querySelector("[data-options]");
const progress = document.querySelector("[data-progress]");
const prevButton = document.querySelector("[data-prev]");
const nextButton = document.querySelector("[data-next]");
const result = document.querySelector("[data-demo-result]");

function renderQuestion() {
  const item = questions[state.current];
  stepLabel.textContent = item.label;
  questionText.textContent = item.question;
  progress.style.width = `${((state.current + 1) / questions.length) * 100}%`;
  optionsNode.innerHTML = "";

  item.options.forEach((option) => {
    const optionButton = document.createElement("button");
    optionButton.type = "button";
    optionButton.textContent = option;
    optionButton.classList.toggle("selected", state.answers[state.current] === option);
    optionButton.addEventListener("click", () => {
      state.answers[state.current] = option;
      renderQuestion();
      renderResult();
    });
    optionsNode.append(optionButton);
  });

  prevButton.disabled = state.current === 0;
  nextButton.textContent = state.current === questions.length - 1 ? "Ver resultado" : "Siguiente";
  renderResult();
}

function renderResult() {
  const answered = state.answers.filter(Boolean).length;
  const hasUnknown = state.answers.some((answer) => answer && /no lo sé|no estoy seguro/i.test(answer));

  if (answered < questions.length) {
    result.innerHTML = `
      <span>Resultado simulado</span>
      <h3>Validación en progreso</h3>
      <p>El sistema ajusta la recomendación a medida que el cliente responde.</p>
    `;
    return;
  }

  if (hasUnknown) {
    result.innerHTML = `
      <span>Resultado simulado</span>
      <h3>Necesitamos validar un dato</h3>
      <p>Cuando falta información técnica, la experiencia deriva a WhatsApp con foto y medidas.</p>
    `;
    return;
  }

  result.innerHTML = `
    <span>Resultado simulado</span>
    <h3>Compatible con alternativas</h3>
    <p>El cliente puede continuar la compra o comparar modelos similares antes de decidir.</p>
  `;
}

prevButton?.addEventListener("click", () => {
  state.current = Math.max(0, state.current - 1);
  renderQuestion();
});

nextButton?.addEventListener("click", () => {
  if (state.current < questions.length - 1) {
    state.current += 1;
    renderQuestion();
    return;
  }

  document.querySelector("#comparativa")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

renderQuestion();
