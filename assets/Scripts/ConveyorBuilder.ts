import { _decorator, Component, Node, Prefab, instantiate, Vec2, Vec3, Vec4, Material, MeshRenderer, gfx, utils } from 'cc';
import { GridManager } from './GridManager';
const { ccclass, property } = _decorator;

/** Геометрия трека вокруг сетки (в локальных координатах, ось Y вверх) */
export interface ConveyorLayout {
    hx: number;      // полуразмер сетки по X (центры крайних блоков)
    hz: number;      // полуразмер сетки по Z
    minX: number; maxX: number;   // ось ленты слева/справа
    minZ: number; maxZ: number;   // ось ленты сверху/снизу
    R: number;       // радиус угла по оси ленты
    startX: number;  // X, где начинается лента после спавнера (нижняя сторона)
    endZ: number;    // Z, где заканчивается лента на левой стороне (перед финишем)
}

interface BeltPiece {
    renderer: MeshRenderer;
    tilingV: number;     // масштаб UV по V (тайлов на кусок)
    baseOffset: number;  // сдвиг V, чтобы узор шел сквозь стыки без разрывов
}

/**
 * Собирает визуал конвейера из модулей Blender (Conveyor_*.glb):
 * спавнер -> прямая -> угол -> прямая -> угол -> прямая -> угол -> прямая -> финиш.
 * Модули смотрят вдоль -Z, угол поворачивает налево с радиусом cornerRadius.
 */
@ccclass('ConveyorBuilder')
export class ConveyorBuilder extends Component {

    @property(GridManager)
    public gridManager: GridManager = null!;

    @property({ type: Prefab, group: 'Modules' }) public straightPrefab: Prefab = null!;
    @property({ type: Prefab, group: 'Modules' }) public cornerPrefab: Prefab = null!;
    @property({ type: Prefab, group: 'Modules' }) public spawnerPrefab: Prefab = null!;
    @property({ type: Prefab, group: 'Modules' }) public endPrefab: Prefab = null!;

    @property({ type: Material, group: 'Materials' }) public beltMaterial: Material = null!;
    @property({ type: Material, group: 'Materials' }) public railMaterial: Material = null!;
    @property({ type: Material, group: 'Materials' }) public baseMaterial: Material = null!;
    @property({ type: Material, group: 'Materials' }) public spawnerBodyMaterial: Material = null!;
    @property({ type: Material, group: 'Materials' }) public discMaterial: Material = null!;
    @property({ type: Material, group: 'Materials' }) public grateMaterial: Material = null!;

    @property({ tooltip: 'Радиус угла по оси ленты (как в Blender)' })
    public cornerRadius: number = 0.8;

    @property({ tooltip: 'Высота поверхности ленты' })
    public beltY: number = -0.15;

    @property({ tooltip: 'Насколько правее левой оси начинается нижняя лента (место под спавнер)' })
    public spawnerOffset: number = 0.55;

    @property({ tooltip: 'Скорость бега стрелок (ед/с). Совпадает со скоростью юнитов' })
    public scrollSpeed: number = 5;

    @property({ tooltip: 'Длина одного тайла шеврона в метрах (как в Blender)' })
    public tileLength: number = 1;

    @property({ tooltip: '1 или -1: направление бега стрелок' })
    public scrollDirection: number = 1;

    // ---------- Тень (запечена в Blender: art_source/conveyor_shadow_bake.blend) ----------
    @property({ type: Material, group: 'Shadow', tooltip: 'Материал тени (M_ConveyorShadow). Пусто — без тени' })
    public shadowMaterial: Material = null!;

    @property({ group: 'Shadow', tooltip: 'Смещение тени по X/Z (свет снизу-справа -> тень вверх-влево)' })
    public shadowOffset: Vec2 = new Vec2(-0.28, -0.32);

    @property({ group: 'Shadow', tooltip: 'Высота плоскости тени (ниже ленты и блоков)' })
    public shadowY: number = -0.45;

    // Параметры запекания (менять только при перезапекании текстуры)
    @property({ group: 'Shadow', tooltip: 'Поля текстуры вокруг оси ленты: слева, справа, сверху, снизу' })
    public shadowPad: Vec4 = new Vec4(1.2, 1.1, 1.1, 1.2);

    @property({ group: 'Shadow', tooltip: '9-slice: неизменяемые края (слева, справа, сверху, снизу) в метрах' })
    public shadowBorder: Vec4 = new Vec4(2.5, 2.4, 2.35, 2.6);

    @property({ group: 'Shadow', tooltip: 'Размер текстуры в метрах при запекании (ширина, высота)' })
    public shadowBakeSize: Vec2 = new Vec2(10.35, 10.35);

    private belts: BeltPiece[] = [];
    private discs: Node[] = [];
    private scrollOffset = 0;
    private pathLength = 0;   // накопленная длина ленты от спавнера
    private uvSign = 1;       // +1 если V растет по ходу движения, -1 если убывает (glb переворачивает V)
    private static readonly MODULE_END_LENGTH = 0.55;   // длина финиша в Blender
    private static readonly HOUSING_HALF_WIDTH = 0.62;  // полуширина корпуса спавнера

    public getLayout(trackOffset: number): ConveyorLayout {
        const gm = this.gridManager;
        const hx = ((gm.cols - 1) * gm.spacing) / 2;
        const hz = ((gm.rows - 1) * gm.spacing) / 2;
        const minX = -hx - trackOffset, maxX = hx + trackOffset;
        const minZ = -hz - trackOffset, maxZ = hz + trackOffset;
        return {
            hx, hz, minX, maxX, minZ, maxZ,
            R: this.cornerRadius,
            startX: minX + this.spawnerOffset,
            endZ: hz,
        };
    }

    /** Габариты видимого трека (с бортиками, спавнером и финишем) в координатах XZ — для кадрирования камеры */
    public getVisualBounds(trackOffset: number): { x0: number; x1: number; z0: number; z1: number } {
        const L = this.getLayout(trackOffset);
        const halfWidth = 0.54;                         // полуширина ленты с бортиками
        const housingBack = 1.25, housingHalf = 0.62;   // корпус спавнера позади начала ленты
        return {
            x0: Math.min(L.minX - halfWidth, L.startX - housingBack),
            x1: L.maxX + halfWidth,
            z0: L.minZ - halfWidth,
            z1: Math.max(L.maxZ + halfWidth, L.maxZ + housingHalf),
        };
    }

    public build(trackOffset: number) {
        this.node.removeAllChildren();
        this.belts = [];
        this.discs = [];
        this.pathLength = 0;
        this.scrollOffset = 0;

        const L = this.getLayout(trackOffset);
        const R = L.R, y = this.beltY;
        if (trackOffset < R) {
            console.warn(`[ConveyorBuilder] trackOffset (${trackOffset}) меньше радиуса угла (${R}): крайние ряды сетки окажутся на дуге`);
        }

        // Направления: +X -> -90°, -Z -> 0°, -X -> 90°, +Z -> 180°
        this.place(this.spawnerPrefab, new Vec3(L.startX, y, L.maxZ), -90);

        this.addStraight(new Vec3(L.startX, y, L.maxZ), -90, (L.maxX - R) - L.startX);
        this.addCorner(new Vec3(L.maxX - R, y, L.maxZ), -90);

        this.addStraight(new Vec3(L.maxX, y, L.maxZ - R), 0, (L.maxZ - L.minZ) - 2 * R);
        this.addCorner(new Vec3(L.maxX, y, L.minZ + R), 0);

        this.addStraight(new Vec3(L.maxX - R, y, L.minZ), 90, (L.maxX - L.minX) - 2 * R);
        this.addCorner(new Vec3(L.minX + R, y, L.minZ), 90);

        this.addStraight(new Vec3(L.minX, y, L.minZ + R), 180, L.endZ - (L.minZ + R));

        // Финиш упирается в корпус спавнера
        const grateEnd = L.maxZ - ConveyorBuilder.HOUSING_HALF_WIDTH - 0.02;
        const grateLen = Math.max(0.15, grateEnd - L.endZ);
        const end = this.place(this.endPrefab, new Vec3(L.minX, y, L.endZ), 180);
        if (end) end.setScale(1, 1, grateLen / ConveyorBuilder.MODULE_END_LENGTH);

        this.buildShadow(L);
    }

    /**
     * Статичная тень: одна плоскость с запеченной текстурой.
     * Меш 9-slice: углы (повороты, спавнер, финиш) не растягиваются,
     * прямые участки тянутся под размер сетки.
     */
    private buildShadow(L: ConveyorLayout) {
        if (!this.shadowMaterial) return;
        const p = this.shadowPad, b = this.shadowBorder, bw = this.shadowBakeSize.x, bh = this.shadowBakeSize.y;
        const X0 = L.minX - p.x, X1 = L.maxX + p.y;
        const Z0 = L.minZ - p.z, Z1 = L.maxZ + p.w;
        if (X1 - X0 < b.x + b.y || Z1 - Z0 < b.z + b.w) {
            console.warn('[ConveyorBuilder] Сетка слишком мала для 9-slice тени — перезапеките тень под новый размер');
        }
        const xs = [X0, Math.min(X0 + b.x, X1 - b.y), Math.max(X1 - b.y, X0 + b.x), X1];
        const zs = [Z0, Math.min(Z0 + b.z, Z1 - b.w), Math.max(Z1 - b.w, Z0 + b.z), Z1];
        const us = [0, b.x / bw, 1 - b.y / bw, 1];
        const vs = [0, b.z / bh, 1 - b.w / bh, 1];   // v = 0 — верх текстуры (сторона -Z)

        const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
        for (let j = 0; j < 4; j++) {
            for (let i = 0; i < 4; i++) {
                positions.push(xs[i], 0, zs[j]);
                normals.push(0, 1, 0);
                uvs.push(us[i], vs[j]);
            }
        }
        for (let j = 0; j < 3; j++) {
            for (let i = 0; i < 3; i++) {
                const a = j * 4 + i, c = a + 1, bb = a + 4, d = bb + 1;
                indices.push(a, bb, c, bb, d, c);   // CCW при взгляде сверху
            }
        }
        const mesh = utils.MeshUtils.createMesh({
            positions, normals, uvs, indices,
            minPos: new Vec3(X0, 0, Z0), maxPos: new Vec3(X1, 0, Z1),
        });
        const n = new Node('ConveyorShadow');
        n.setParent(this.node);
        n.setPosition(this.shadowOffset.x, this.shadowY, this.shadowOffset.y);
        const mr = n.addComponent(MeshRenderer);
        mr.mesh = mesh;
        mr.setSharedMaterial(this.shadowMaterial, 0);
        mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
    }

    /** Показывает столько таблеток в спавнере, сколько свободных слотов */
    public setAvailableSlots(count: number) {
        this.discs.forEach((d, i) => d.active = i < count);
    }

    update(dt: number) {
        if (this.belts.length === 0) return;
        // Узор движется вперед по ходу ленты вне зависимости от ориентации UV
        this.scrollOffset -= this.uvSign * this.scrollDirection * this.scrollSpeed * dt / this.tileLength;
        this.scrollOffset -= Math.floor(this.scrollOffset);
        for (const b of this.belts) {
            const mat = b.renderer.getMaterialInstance(0);
            mat?.setProperty('tilingOffset', new Vec4(1, b.tilingV, 0, b.baseOffset + this.scrollOffset));
        }
    }

    // ---------------------------------------------------------------

    private addStraight(pos: Vec3, yawDeg: number, length: number) {
        if (length <= 0.001) return;
        const n = this.place(this.straightPrefab, pos, yawDeg);
        if (!n) return;
        n.setScale(1, 1, length);
        this.registerBelts(n, length);
    }

    private addCorner(pos: Vec3, yawDeg: number) {
        const n = this.place(this.cornerPrefab, pos, yawDeg);
        if (n) this.registerBelts(n, Math.PI * this.cornerRadius / 2);
    }

    private place(prefab: Prefab, pos: Vec3, yawDeg: number): Node | null {
        if (!prefab) return null;
        const n = instantiate(prefab);
        n.setParent(this.node);
        n.setPosition(pos);
        n.setRotationFromEuler(0, yawDeg, 0);
        this.applyMaterials(n);
        return n;
    }

    private applyMaterials(root: Node) {
        const walk = (node: Node) => {
            const mr = node.getComponent(MeshRenderer);
            if (mr) {
                const mat = this.pickMaterial(node.name);
                if (mat) mr.setSharedMaterial(mat, 0);
                mr.shadowCastingMode = MeshRenderer.ShadowCastingMode.OFF;
            }
            if (/Spawner_Disc_\d+/.test(node.name)) this.discs.push(node);
            node.children.forEach(walk);
        };
        walk(root);
        this.discs.sort((a, b) => a.name.localeCompare(b.name));
    }

    private pickMaterial(name: string): Material | null {
        if (name.endsWith('_Belt')) return this.beltMaterial;
        if (name.endsWith('_Base') || name.includes('TrayInner') || name.includes('End_Plate')) return this.baseMaterial;
        if (name.includes('Rail') || name.includes('Tray') || name.includes('End_Cap')) return this.railMaterial;
        if (name.includes('Housing')) return this.spawnerBodyMaterial;
        if (name.includes('Disc')) return this.discMaterial;
        if (name.includes('Slat')) return this.grateMaterial;
        return null;
    }

    /**
     * Регистрирует ленту куска длиной pieceLen (м) так, чтобы фаза шеврона
     * продолжалась с того места, где закончился предыдущий кусок.
     * Ориентация V читается из самого меша: v0 — значение V в начале куска (точка 0,0,0),
     * знак — растет V по ходу движения или убывает.
     */
    private registerBelts(root: Node, pieceLen: number) {
        const walk = (node: Node) => {
            const mr = node.getComponent(MeshRenderer);
            if (mr && mr.mesh && node.name.endsWith('_Belt')) {
                const pos = mr.mesh.readAttribute(0, gfx.AttributeName.ATTR_POSITION);
                const uv = mr.mesh.readAttribute(0, gfx.AttributeName.ATTR_TEX_COORD);
                if (!pos || !uv) return;
                let v0 = 0, best = Infinity, vMin = Infinity, vMax = -Infinity;
                for (let i = 0; i < uv.length / 2; i++) {
                    const v = uv[i * 2 + 1];
                    vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
                    const d = Math.abs(pos[i * 3]) + Math.abs(pos[i * 3 + 1]) + Math.abs(pos[i * 3 + 2]) * 4;
                    if (d < best) { best = d; v0 = v; }
                }
                const vRange = Math.max(1e-4, vMax - vMin);
                const sign = (v0 - vMin) < (vMax - v0) ? 1 : -1;
                this.uvSign = sign;
                // t = v * tiling + offset;  хотим t = sign * (S0 + s) / tile + phase
                const tiling = pieceLen / (vRange * this.tileLength);
                const baseOffset = sign * this.pathLength / this.tileLength - v0 * tiling;
                this.belts.push({ renderer: mr, tilingV: tiling, baseOffset });
            }
            node.children.forEach(walk);
        };
        walk(root);
        this.pathLength += pieceLen;
    }
}
