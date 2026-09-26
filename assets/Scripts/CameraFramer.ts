import { _decorator, Component, Camera, view, Vec3 } from 'cc';
import { ConveyorBuilder } from './ConveyorBuilder';
import { TrackManager } from './TrackManager';
const { ccclass, property, requireComponent } = _decorator;

/**
 * Кадрирует игровое поле (конвейер + сетка) под любое соотношение сторон экрана.
 * Камера ортографическая, наклон как у запеченных спрайтов блоков (70°).
 * Поле вписывается в зону экрана [boardTop..boardBottom] по высоте и с полями marginX по ширине,
 * чтобы не залезать на колоду юнитов внизу.
 */
@ccclass('CameraFramer')
@requireComponent(Camera)
export class CameraFramer extends Component {

    @property(ConveyorBuilder)
    public conveyor: ConveyorBuilder = null!;

    @property(TrackManager)
    public trackManager: TrackManager = null!;

    @property({ tooltip: 'Верх зоны поля — доля высоты экрана сверху (0 = самый верх)' })
    public boardTop: number = 0.05;

    @property({ tooltip: 'Низ зоны поля — доля высоты экрана сверху (ниже начинается UI колоды)' })
    public boardBottom: number = 0.74;

    @property({ tooltip: 'Зазор между полем и колодой — доля высоты экрана' })
    public deckGap: number = 0.02;

    /** Верх колоды (доля высоты экрана сверху). Задаёт QueueManager после раскладки колоды */
    private deckTop: number | null = null;

    public setDeckTop(fraction: number | null) {
        this.deckTop = fraction;
    }

    @property({ tooltip: 'Поля слева и справа — доля ширины экрана' })
    public marginX: number = 0.03;

    @property({ tooltip: 'Наклон камеры в градусах (спрайты блоков запечены под 70°)' })
    public pitch: number = 70;

    @property({ tooltip: 'Расстояние от камеры до поля (для ортографии влияет только на отсечение)' })
    public distance: number = 40;

    start() {
        this.apply();
        view.on('canvas-resize', this.onResize, this);
    }

    onDestroy() {
        view.off('canvas-resize', this.onResize, this);
    }

    private onResize() {
        this.apply();
    }

    /** aspect — ширина/высота экрана; если не задан, берется из текущего окна */
    public apply(aspect?: number) {
        if (!this.conveyor || !this.trackManager) return;
        const cam = this.getComponent(Camera)!;
        if (aspect === undefined) {
            const size = view.getVisibleSize();
            aspect = size.width / Math.max(1, size.height);
        }

        const b = this.conveyor.getVisualBounds(this.trackManager.trackOffset);
        const p = this.pitch * Math.PI / 180;
        const sinP = Math.sin(p);

        // Размер поля в плоскости экрана камеры
        const w = b.x1 - b.x0;
        const h = (b.z1 - b.z0) * sinP;

        const fw = Math.max(0.1, 1 - 2 * this.marginX);
        const bottom = this.deckTop !== null ? Math.min(this.boardBottom, this.deckTop - this.deckGap) : this.boardBottom;
        const fh = Math.max(0.1, bottom - this.boardTop);
        const orthoHeight = Math.max(w / (2 * aspect * fw), h / (2 * fh));

        cam.projection = Camera.ProjectionType.ORTHO;
        cam.orthoHeight = orthoHeight;

        // Центр поля должен оказаться в центре зоны [boardTop..boardBottom]
        const zoneCenter = (this.boardTop + bottom) / 2;       // доля от верха
        const upShift = (0.5 - zoneCenter) * 2 * orthoHeight;             // на сколько поле выше центра экрана
        const cx = (b.x0 + b.x1) / 2;
        const cz = (b.z0 + b.z1) / 2;
        const look = new Vec3(cx, 0, cz + upShift / sinP);

        const fwd = new Vec3(0, -Math.sin(p), -Math.cos(p));
        this.node.setWorldPosition(
            look.x - fwd.x * this.distance,
            look.y - fwd.y * this.distance,
            look.z - fwd.z * this.distance);
        this.node.setRotationFromEuler(-this.pitch, 0, 0);
    }
}
