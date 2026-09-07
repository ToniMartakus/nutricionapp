import { jsPDF } from "jspdf";

export type RecipeForPdf = {
  title: string;
  kind: "Comida" | "Cena";
  mode: "Low carb" | "Familiar";
  activeMinutes: number;
  totalMinutes: number;
  servings: number;
  difficulty: "Fácil" | "Muy fácil";
  tools: string[];
  calories: number;
  protein: number;
  carbs: number;
  ingredients: Array<{ name: string; amount: number; unit: string }>;
  steps: string[];
  childNote?: string;
  requestedException?: boolean;
  requestedExceptionReason?: string;
};

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 18;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const GREEN: [number, number, number] = [34, 91, 78];
const TERRACOTTA: [number, number, number] = [190, 104, 73];
const CREAM: [number, number, number] = [250, 247, 239];
const INK: [number, number, number] = [38, 47, 43];
const MUTED: [number, number, number] = [102, 111, 106];
const LINE: [number, number, number] = [220, 213, 200];

function safeFilename(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "receta";
}

export function recipePdfFilename(recipe: RecipeForPdf) {
  return `${safeFilename(recipe.title)}-nutricionapp.pdf`;
}

export function createRecipePdf(recipe: RecipeForPdf) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  pdf.setProperties({
    title: recipe.title,
    subject: "Receta de NUTRICIONAPP",
    author: "NUTRICIONAPP",
    creator: "NUTRICIONAPP",
  });
  let y = 36;

  const drawPageFrame = (continued = false) => {
    pdf.setFillColor(...CREAM);
    pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
    pdf.setDrawColor(...GREEN);
    pdf.setLineWidth(0.6);
    pdf.rect(9, 9, PAGE_WIDTH - 18, PAGE_HEIGHT - 18);
    pdf.setFillColor(...GREEN);
    pdf.rect(9, 9, PAGE_WIDTH - 18, 18, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("times", "bold");
    pdf.setFontSize(13);
    pdf.text("NUTRICIONAPP", MARGIN, 20.5);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(continued ? "RECETA - CONTINUACIÓN" : "MI RECETARIO", PAGE_WIDTH - MARGIN, 20.5, { align: "right" });
    y = 36;
  };

  const ensureSpace = (height: number) => {
    if (y + height <= PAGE_HEIGHT - 20) return;
    pdf.addPage();
    drawPageFrame(true);
  };

  const sectionTitle = (title: string) => {
    ensureSpace(13);
    pdf.setDrawColor(...TERRACOTTA);
    pdf.setLineWidth(1.2);
    pdf.line(MARGIN, y + 1.5, MARGIN + 9, y + 1.5);
    pdf.setTextColor(...GREEN);
    pdf.setFont("times", "bold");
    pdf.setFontSize(15);
    pdf.text(title, MARGIN + 13, y + 3);
    y += 11;
  };

  const addWrappedText = (text: string, options?: { color?: [number, number, number]; size?: number; indent?: number }) => {
    const indent = options?.indent ?? 0;
    pdf.setTextColor(...(options?.color ?? INK));
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(options?.size ?? 10);
    const lines = pdf.splitTextToSize(text, CONTENT_WIDTH - indent) as string[];
    const height = lines.length * 5;
    ensureSpace(height + 3);
    pdf.text(lines, MARGIN + indent, y);
    y += height;
  };

  drawPageFrame();

  pdf.setTextColor(...TERRACOTTA);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.text(`${recipe.kind.toUpperCase()}  /  ${recipe.mode.toUpperCase()}`, MARGIN, y);
  y += 7;

  pdf.setTextColor(...INK);
  pdf.setFont("times", "bold");
  pdf.setFontSize(25);
  const titleLines = pdf.splitTextToSize(recipe.title, CONTENT_WIDTH) as string[];
  pdf.text(titleLines, MARGIN, y);
  y += titleLines.length * 9 + 5;

  if (recipe.requestedException && recipe.requestedExceptionReason) {
    const lines = pdf.splitTextToSize(`Excepción solicitada: ${recipe.requestedExceptionReason}`, CONTENT_WIDTH - 12) as string[];
    const boxHeight = lines.length * 4.5 + 8;
    ensureSpace(boxHeight + 3);
    pdf.setFillColor(255, 244, 211);
    pdf.setDrawColor(232, 197, 106);
    pdf.roundedRect(MARGIN, y, CONTENT_WIDTH, boxHeight, 2, 2, "FD");
    pdf.setTextColor(116, 82, 0);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text(lines, MARGIN + 6, y + 6);
    y += boxHeight + 6;
  }

  const stats = [
    ["Tiempo activo", `${recipe.activeMinutes} min`],
    ["Tiempo total", `${recipe.totalMinutes} min`],
    ["Raciones", String(recipe.servings)],
    ["Dificultad", recipe.difficulty],
  ];
  const statWidth = CONTENT_WIDTH / stats.length;
  stats.forEach(([label, value], index) => {
    const x = MARGIN + index * statWidth;
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(...LINE);
    pdf.roundedRect(x + 1, y, statWidth - 2, 18, 1.5, 1.5, "FD");
    pdf.setTextColor(...MUTED);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.text(label, x + statWidth / 2, y + 6, { align: "center" });
    pdf.setTextColor(...GREEN);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(value, x + statWidth / 2, y + 13, { align: "center" });
  });
  y += 26;

  sectionTitle("Información nutricional");
  const nutrition = [
    ["Calorías", `${recipe.calories} kcal`],
    ["Proteínas", `${recipe.protein} g`],
    ["Hidratos", `${recipe.carbs} g`],
  ];
  nutrition.forEach(([label, value], index) => {
    const x = MARGIN + index * (CONTENT_WIDTH / 3);
    pdf.setTextColor(...MUTED);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(label, x, y);
    pdf.setTextColor(...GREEN);
    pdf.setFont("times", "bold");
    pdf.setFontSize(14);
    pdf.text(value, x, y + 6);
  });
  y += 14;

  sectionTitle("Utensilios");
  addWrappedText(recipe.tools.join("  -  "), { size: 10.5 });
  y += 2;

  sectionTitle("Ingredientes");
  recipe.ingredients.forEach((ingredient) => {
    const amount = `${ingredient.amount} ${ingredient.unit}`.trim();
    const nameLines = pdf.splitTextToSize(ingredient.name, CONTENT_WIDTH - 42) as string[];
    const rowHeight = Math.max(7, nameLines.length * 4.5 + 2);
    ensureSpace(rowHeight + 1);
    pdf.setTextColor(...INK);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.text(nameLines, MARGIN + 4, y + 4);
    pdf.setTextColor(...GREEN);
    pdf.setFont("helvetica", "bold");
    pdf.text(amount, PAGE_WIDTH - MARGIN - 4, y + 4, { align: "right" });
    pdf.setDrawColor(...LINE);
    pdf.setLineWidth(0.25);
    pdf.line(MARGIN, y + rowHeight, PAGE_WIDTH - MARGIN, y + rowHeight);
    y += rowHeight;
  });
  y += 5;

  if (recipe.childNote) {
    sectionTitle("Adaptación infantil");
    addWrappedText(recipe.childNote, { color: [108, 83, 42], size: 9.5, indent: 4 });
    y += 3;
  }

  sectionTitle("Preparación");
  recipe.steps.forEach((step, index) => {
    const lines = pdf.splitTextToSize(step, CONTENT_WIDTH - 14) as string[];
    const stepHeight = lines.length * 4.8 + 7;
    ensureSpace(stepHeight);
    pdf.setFillColor(...GREEN);
    pdf.circle(MARGIN + 4.5, y + 2.2, 4.3, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.text(String(index + 1), MARGIN + 4.5, y + 3.1, { align: "center" });
    pdf.setTextColor(...INK);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.text(lines, MARGIN + 14, y);
    y += stepHeight;
  });

  const totalPages = pdf.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    pdf.setTextColor(...MUTED);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.text("Valores nutricionales aproximados. Revisa los ingredientes en caso de alergia o intolerancia.", MARGIN, PAGE_HEIGHT - 13);
    pdf.text(`${page} / ${totalPages}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 13, { align: "right" });
  }

  return pdf.output("blob");
}
