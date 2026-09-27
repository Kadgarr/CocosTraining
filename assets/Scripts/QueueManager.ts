import { _decorator, Component, Node, Label, Sprite, Color, Prefab, instantiate, Camera, Vec3, UITransform, Layout, Widget, view, screen, tween, Tween } from 'cc';
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

    @property({ min: 0.05, step: 0.01, tooltip: 'Длительность сдвига колонки после спавна юнита, сек' })
    public shiftDuration: number = 0.25;

    private slotScale: number = 90;

    /** Незавершённые анимации сдвига: колонка -> мгновенно доиграть */
    private pendingShifts = new Map<number, () => void>();

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

        // Доигрываем прошлый сдвиг этой колонки, чтобы первой была актуальная кнопка
        this.pendingShifts.get(colIndex)?.();
        const launchFrom = this.getLaunchPoint(colIndex);

        // Забираем передний юнит из выбранной колонки
        const selectedUnit = col.shift()!;

        // Добавляем новый случайный юнит в конец колонки для бесконечного потока
        col.push(this.getRandomUnitData());

        // Спавним забранный юнит на стартовый вейпоинт трека
        this.trackManager.spawnUnit(selectedUnit.colorType, selectedUnit.capacity, launchFrom ?? undefined, this.deckUnitScale);

        // Плавно сдвигаем колонку вместо полной перерисовки (кролик из кнопки уже улетел как 3D-юнит)
        this.animateColumnShift(colIndex, !!launchFrom);
    }

    /**
     * Точка в мире (на плоскости трека), где 3D-кролик совпадёт на экране с кроликом в передней кнопке колонки.
     * Масштаб при этом = deckUnitScale (кнопки ровно во столько раз крупнее юнита на конвейере).
     */
    private getLaunchPoint(colIndex: number): Vec3 | null {
        const colNode = this.columnNodes[colIndex];
        const front = colNode?.children[0];
        const slot = front?.getComponent(UnitSlot);
        const model = slot?.modelRenderer ? slot.modelRenderer.node : front;
        if (!model || !this.uiCamera || !this.mainCamera || !this.trackManager) return null;
        const scr = new Vec3();
        this.uiCamera.worldToScreen(model.worldPosition, scr);
        const ray = this.mainCamera.screenPointToRay(scr.x, scr.y);
        const planeY = this.trackManager.node.worldPosition.y;
        if (Math.abs(ray.d.y) < 1e-5) return null;
        const t = (planeY - ray.o.y) / ray.d.y;
        return new Vec3(ray.o.x + ray.d.x * t, planeY, ray.o.z + ray.d.z * t);
    }

    private finishAllShifts() {
        const list = Array.from(this.pendingShifts.values());
        this.pendingShifts.clear();
        list.forEach(fn => fn());
    }

    /**
     * Передний юнит «сдувается», остальные плавно поднимаются на ряд выше,
     * новый юнит выпрыгивает снизу. Тени (в общем слое) следуют за своими кнопками.
     * Данные колонки уже сдвинуты (shift + push) к моменту вызова.
     */
    private animateColumnShift(colIndex: number, launched: boolean = false) {
        this.pendingShifts.get(colIndex)?.();

        const colNode = this.columnNodes[colIndex];
        const colData = this.columnsData[colIndex];
        const layout = colNode?.getComponent(Layout);
        if (!colNode || !colData || colNode.children.length === 0) { this.renderDeck(); return; }
        layout?.updateLayout();

        const slots = colNode.children.slice();
        const n = slots.length;
        const pos = slots.map(c => c.position.clone());
        const step = n > 1 ? Vec3.subtract(new Vec3(), pos[n - 1], pos[n - 2]) : new Vec3(0, -this.slotScale * 1.25, 0);
        if (layout) layout.enabled = false;   // позиции ведём сами

        const d = Math.max(0.01, this.shiftDuration);

        // Тень живёт в общем слое: запоминаем её смещение от кнопки и держим рядом при движении/масштабе
        const shadowOf = (node: Node) => node.getComponent(UnitSlot)?.shadowNode ?? null;
        const offsets = new Map<Node, Vec3>();
        const bindShadow = (node: Node) => {
            const sh = shadowOf(node);
            if (sh) offsets.set(node, Vec3.subtract(new Vec3(), sh.worldPosition, node.worldPosition));
        };
        const syncShadow = (node: Node) => {
            const sh = shadowOf(node);
            const off = offsets.get(node);
            if (!sh || !off || !sh.isValid) return;
            const k = node.scale.x;
            const w = node.worldPosition;
            sh.setWorldPosition(w.x + off.x * k, w.y + off.y * k, w.z + off.z * k);
            const s = this.slotScale * k;
            sh.setScale(s, s, s);
        };

        // 1) Уходящий передний юнит
        const leaving = slots[0];
        leaving.getComponent(UnitSlot)?.setInteractive(false, false);
        bindShadow(leaving);

        // 2) Остальные поднимаются на ряд выше; следующий сразу становится кликабельным
        for (let i = 1; i < n; i++) bindShadow(slots[i]);
        slots[1]?.getComponent(UnitSlot)?.setInteractive(true);

        // 3) Новый юнит снизу
        const newData = colData[colData.length - 1];
        let added: Node | null = null;
        if (newData && this.unitSlotPrefab) {
            added = instantiate(this.unitSlotPrefab);
            added.parent = colNode;
            const slot = added.getComponent(UnitSlot);
            slot?.init(newData, colIndex, n === 1, this);
            slot?.applyScale(this.slotScale);
            added.setPosition(Vec3.add(new Vec3(), pos[n - 1], step));
            // Тень переносим в слой, пока кнопка в масштабе 1: при нулевом масштабе
            // обратная матрица вырождается и поворот тени становится NaN (тень пропадает)
            added.setScale(1, 1, 1);
            const sh = shadowOf(added);
            if (sh && this.shadowLayer) sh.setParent(this.shadowLayer, true);
            bindShadow(added);
            added.setScale(0, 0, 1);
            syncShadow(added);
        }

        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            this.pendingShifts.delete(colIndex);
            const all = [leaving, ...slots.slice(1), ...(added ? [added] : [])];
            all.forEach(nd => nd.isValid && Tween.stopAllByTarget(nd));
            // уходящий — удаляем вместе с тенью
            const lsh = shadowOf(leaving);
            if (lsh && lsh.isValid) { lsh.removeFromParent(); lsh.destroy(); }
            if (leaving.isValid) { leaving.removeFromParent(); leaving.destroy(); }
            for (let i = 1; i < n; i++) {
                if (!slots[i].isValid) continue;
                slots[i].setPosition(pos[i - 1]);
                slots[i].setScale(1, 1, 1);
                syncShadow(slots[i]);
            }
            if (added && added.isValid) {
                added.setPosition(pos[n - 1]);
                added.setScale(1, 1, 1);
                syncShadow(added);
            }
            if (layout) { layout.enabled = true; layout.updateLayout(); }
            // после раскладки ещё раз прижимаем тени к кнопкам
            for (const nd of all) if (nd.isValid && nd !== leaving) syncShadow(nd);
        };
        this.pendingShifts.set(colIndex, finish);

        if (launched) {
            // Кролик уже летит на конвейер 3D-юнитом — кнопку прячем сразу
            leaving.setScale(0, 0, 1);
            syncShadow(leaving);
        } else {
            tween(leaving)
                .to(d * 0.6, { scale: new Vec3(0, 0, 1) }, { easing: 'backIn', onUpdate: () => syncShadow(leaving) })
                .start();
        }

        // Следующие кнопки чуть ждут, чтобы не наехать на взлетающего кролика
        const riseDelay = d * (launched ? 0.35 : 0.15);
        for (let i = 1; i < n; i++) {
            const nd = slots[i];
            tween(nd)
                .delay(riseDelay)
                .to(d, { position: pos[i - 1] }, { easing: 'cubicOut', onUpdate: () => syncShadow(nd) })
                .start();
        }

        if (added) {
            const nd = added;
            tween(nd)
                .delay(riseDelay + d * 0.2)
                .to(d, { position: pos[n - 1], scale: new Vec3(1, 1, 1) }, { easing: 'backOut', onUpdate: () => syncShadow(nd) })
                .start();
        }

        this.scheduleOnce(finish, d * 1.4);
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
        this.finishAllShifts();
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
