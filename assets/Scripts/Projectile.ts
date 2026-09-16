import { _decorator, Component, Vec3, tween } from 'cc';
const { ccclass } = _decorator;

@ccclass('Projectile')
export class Projectile extends Component {

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