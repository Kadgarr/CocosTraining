import { _decorator, Component, Vec3, tween, MeshRenderer, Mesh, utils, primitives } from 'cc';
const { ccclass } = _decorator;

@ccclass('Projectile')
export class Projectile extends Component {

    /**
     * Общий для всех снарядов лёгкий меш сферы. Генерируется в коде, чтобы в сборку
     * не попадал встроенный primitives.fbx (~87 КБ ради одной сферы).
     */
    private static sharedMesh: Mesh | null = null;

    onLoad() {
        const mr = this.getComponent(MeshRenderer);
        if (mr && !mr.mesh) {
            if (!Projectile.sharedMesh) {
                Projectile.sharedMesh = utils.MeshUtils.createMesh(
                    primitives.sphere(0.5, { segments: 12 }));
            }
            mr.mesh = Projectile.sharedMesh;
        }
    }

    /**
     * Запуск снаряда из начальной точки в целевую
     */
    public launch(startPos: Vec3, targetPos: Vec3, duration: number = 0.12, onHit?: () => void) {
        this.node.setPosition(startPos);

        tween(this.node)
            .to(duration, { position: targetPos }, { easing: 'sineOut' })
            .call(() => {
                if (onHit) onHit();
                this.node.destroy(); // Удаляем ноду (или возвращаем в Pool)
            })
            .start();
    }
}
