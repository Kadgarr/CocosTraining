import { _decorator, Component, Node, Label, Sprite, Color, Prefab, instantiate, Camera, Vec3, UITransform, Layout, Widget, view, screen } from 'cc';
import { CameraFramer } from './CameraFramer';
import { TrackManager } from './TrackManager';
import { ColorType } from './Types';
import { UnitSlot } from './UnitSlot';
const { ccclass, property } = _decorator;

export interface UnitData {
    colorType: ColorType;
    capacity: number;
}

@ccclass('QueueManager')
export class QueueManager extends Component {
    @property(TrackManager)
    public trackManager: TrackManager = null!;

    // Родительские узлы для 4-х колонок на UI / сцене
    @property([Node])
    public columnNodes: Node[] = [];

    // Префаб отображения слота юнита
    @property(Prefab)
    public unitSlotPrefab: Node = null!;

    // ---------- Размер кнопок относительно юнита на конвейере ----------
    @property({ type: Camera, tooltip: 'Игровая камера (Main Camera)' })
    public mainCamera: Camera = null!;

    @property({ type: Camera, tooltip: 'UI-камера (Canvas/Camera)' })
    public uiCamera: Camera = null!;

    @property({ type: CameraFramer, tooltip: 'Кадрирование поля: колода сообщает ему свой верх, чтобы не перекрываться' })
    public framer: CameraFramer = null!;

    @property({ tooltip: 'Кролик в кнопке крупнее кролика на конвейере во столько раз (на экране)' })
    public deckUnitScale: number = 1.5;

    @property({ min: 0, step: 0.01, slide: true, range: [0, 1, 0.01],
        tooltip: 'Расстояние между колонками кнопок по ширине — доля ширины кнопки (0 = вплотную, 0.5 = половина кнопки)' })
    public columnSpacing: number = 0.1;

    @property({ tooltip: 'Отступ низа колоды от низа экрана — доля высоты экрана' })
    public deckBottomMargin: number = 0.03;

    private slotScale: number = 90;

    /** Слой теней кнопок: рисуется перед колодой, чтобы тени не ложились поверх соседних кроликов */
    private shadowLayer: Node | null = null;

    // 2D массив юнитов: columnsData[colIndex][rowIndex]
    private columnsData: UnitData[][] = [];

    start() {
        this.generateDeckData();
        this.renderDeck();
        // Камеры получают итоговые размеры после первого кадра — тогда и считаем масштаб кнопок
        this.scheduleOnce(() => this.relayout(), 0);
        view.on('canvas-resize', this.onResize, this);
    }

    onDestroy() {
        view.off('canvas-resize', this.onResize, this);
    }

    private onResize() {
        this.scheduleOnce(() => this.relayout(), 0);
    }

    /**
     * Масштаб кнопок = deckUnitScale × размер юнита на конвейере (в пикселях экрана).
     * Колода и поле зависят друг от друга, поэтому делаем пару итераций до сходимости.
     */
    public relayout() {
        for (let i = 0; i < 3; i++) {
            this.slotScale = this.computeSlotScale();
            this.renderDeck();
            this.updateLayouts();
            this.positionDeck();
            if (!this.framer || !this.mainCamera) break;
            const before = this.mainCamera.orthoHeight;
            this.framer.setDeckTop(this.getDeckTopFraction());
            this.framer.apply();
            if (this.mainCamera.camera) this.mainCamera.camera.update(true);
            if (Math.abs(this.mainCamera.orthoHeight - before) / Math.max(0.001, before) < 0.01) break;
        }
    }

    /** UI-единиц на метр мира, умноженное на deckUnitScale */
    private computeSlotScale(): number {
        const cam = this.mainCamera, ui = this.uiCamera, ref = this.columnNodes[0];
        if (!cam || !ui || !ref) return this.slotScale;
        if (cam.camera) cam.camera.update(true);
        const a = new Vec3(), b = new Vec3();
        cam.worldToScreen(new Vec3(0, 0, 0), a);
        cam.worldToScreen(new Vec3(1, 0, 0), b);
        const pxPerWorld = Math.abs(b.x - a.x);
        const t = ref.getComponent(UITransform);
        if (!t) return this.slotScale;
        const p0 = t.convertToWorldSpaceAR(new Vec3(0, 0, 0));
        const p1 = t.convertToWorldSpaceAR(new Vec3(100, 0, 0));
        ui.worldToScreen(p0, a);
        ui.worldToScreen(p1, b);
        const pxPerUI = Math.abs(b.x - a.x) / 100;
        if (pxPerWorld <= 0 || pxPerUI <= 0) return this.slotScale;
        return this.deckUnitScale * pxPerWorld / pxPerUI;
    }

    private updateLayouts() {
        for (const col of this.columnNodes) col?.getComponent(Layout)?.updateLayout();
        const deck = this.columnNodes[0]?.parent;
        const deckLayout = deck?.getComponent(Layout);
        if (deckLayout) {
            // Ширина кнопки = 0.8 × масштаб модели (см. UnitSlot.applyScale)
            deckLayout.spacingX = Math.max(0, this.columnSpacing) * 0.8 * this.slotScale;
            deckLayout.updateLayout();
        }
    }

    private ensureShadowLayer() {
        if (this.shadowLayer && this.shadowLayer.isValid) return;
        const deck = this.columnNodes[0]?.parent;
        if (!deck || !deck.parent) return;
        const layer = new Node('DeckShadows');
        layer.layer = deck.layer;
        deck.parent.insertChild(layer, deck.getSiblingIndex());   // перед колодой = рисуется раньше
        layer.setWorldPosition(deck.worldPosition);
        this.shadowLayer = layer;
    }

    /** Переносим тени кнопок в общий слой, сохраняя их положение на экране */
    private collectShadows() {
        if (!this.shadowLayer) return;
        for (const col of this.columnNodes) {
            if (!col) continue;
            for (const slotNode of col.children) {
                const slot = slotNode.getComponent(UnitSlot);
                const sh = slot ? slot.shadowNode : null;
                if (sh && sh.parent !== this.shadowLayer) sh.setParent(this.shadowLayer, true);
            }
        }
    }

    /** Колода растёт вверх: низ колонок ставим на deckBottomMargin от низа экрана */
    private positionDeck() {
        const deck = this.columnNodes[0]?.parent;
        if (!deck || !this.uiCamera) return;
        const widget = deck.getComponent(Widget);
        if (widget) widget.enabled = false;   // позицию колоды теперь задаём сами
        let minY = Infinity;
        for (const col of this.columnNodes) {
            const t = col?.getComponent(UITransform);
            if (t) minY = Math.min(minY, this.nodeWorldRect(t).yMin);
        }
        if (!isFinite(minY)) return;
        const target = new Vec3();
        this.uiCamera.screenToWorld(new Vec3(0, screen.windowSize.height * this.deckBottomMargin, 0), target);
        const dy = target.y - minY;
        const p = deck.worldPosition;
        deck.setWorldPosition(p.x, p.y + dy, p.z);
        if (this.shadowLayer) {
            const s = this.shadowLayer.worldPosition;
            this.shadowLayer.setWorldPosition(s.x, s.y + dy, s.z);
        }
    }

    /** Мировой прямоугольник узла только по его UITransform (без детей) */
    private nodeWorldRect(t: UITransform) {
        const w = t.contentSize.width, h = t.contentSize.height, a = t.anchorPoint;
        const lo = t.convertToWorldSpaceAR(new Vec3(-w * a.x, -h * a.y, 0));
        const hi = t.convertToWorldSpaceAR(new Vec3(w * (1 - a.x), h * (1 - a.y), 0));
        return { yMin: Math.min(lo.y, hi.y), yMax: Math.max(lo.y, hi.y) };
    }

    /** Верх колоды как доля высоты экрана, считая сверху */
    private getDeckTopFraction(): number | null {
        if (!this.uiCamera) return null;
        let top = -Infinity;
        for (const col of this.columnNodes) {
            // Рамка самой колонки (Layout подгоняет её под кнопки); дочерние 3D-модели не учитываем
            const t = col?.getComponent(UITransform);
            if (t) top = Math.max(top, this.nodeWorldRect(t).yMax);
        }
        if (!isFinite(top)) return null;
        const out = new Vec3();
        this.uiCamera.worldToScreen(new Vec3(0, top, 0), out);
        const h = screen.windowSize.height;
        return h > 0 ? 1 - out.y / h : null;
    }

    private generateDeckData() {

        const numColumns = 4;
        const unitsPerColumn = 3;
        const colors = [ColorType.WHITE, ColorType.BLACK];
        const capacity=20;

        this.columnsData = [];

        for (let col = 0; col < numColumns; col++) {
            const column: UnitData[] = [];
            for (let row = 0; row < unitsPerColumn; row++) {
                // Случайный цвет и емкость
                const randomColor = colors[Math.floor(Math.random() * colors.length)];

                column.push({
                colorType: randomColor,
                capacity: capacity
                });
            }
        this.columnsData.push(column);
        }
    }

    public onUnitSlotClicked(colIndex: number) {
        if (colIndex < 0 || colIndex >= this.columnsData.length) return;

        const col = this.columnsData[colIndex];
        if (!col || col.length === 0) return;

        // Проверяем, есть ли место на треке
        if (!this.trackManager.canSpawnUnit()) {
            console.log("Трек заполнен! Нельзя заспавнить юнита.");
            return;
        }

        // Забираем передний юнит из выбранной колонки
        const selectedUnit = col.shift()!;

        // Добавляем новый случайный юнит в конец колонки для бесконечного потока
        col.push(this.getRandomUnitData());

        // Спавним забранный юнит на стартовый вейпоинт трека
        this.trackManager.spawnUnit(selectedUnit.colorType, selectedUnit.capacity);

        // Обновляем отображение колоды
        this.renderDeck();
    }

    private getRandomUnitData(): UnitData {
        const colors = [ColorType.WHITE, ColorType.BLACK];
        const capacities = [10, 15, 20, 25];

        return {
            colorType: colors[Math.floor(Math.random() * colors.length)],
            capacity: capacities[Math.floor(Math.random() * capacities.length)]
        };
    }

    private renderDeck() {
        this.ensureShadowLayer();
        this.shadowLayer?.destroyAllChildren();
        this.shadowLayer?.removeAllChildren();
        for (let colIndex = 0; colIndex < this.columnNodes.length; colIndex++) {
            const colNode = this.columnNodes[colIndex];
            if (!colNode) continue;

            // Очищаем старые ноды
            colNode.removeAllChildren();

            const colData = this.columnsData[colIndex];
            if (!colData) continue;

            // Отрисовываем юниты в колонке
            for (let rowIndex = 0; rowIndex < colData.length; rowIndex++) {
                const unitData = colData[rowIndex];
                const slotNode = instantiate(this.unitSlotPrefab);
                slotNode.parent = colNode;

                // Настраиваем компонент UnitSlot
                const slotScript = slotNode.getComponent(UnitSlot);
                if (slotScript) {
                    const isInteractive = (rowIndex === 0); // Кликабелен только передний юнит
                    slotScript.init(unitData, colIndex, isInteractive, this);
                    slotScript.applyScale(this.slotScale);
                }
            }
        }
        this.updateLayouts();
        this.collectShadows();
    }
}
