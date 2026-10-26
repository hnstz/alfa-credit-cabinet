package ru.oldzoomer.alfacreditbackend.service;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import ru.oldzoomer.alfacreditbackend.dto.UserDto;
import ru.oldzoomer.alfacreditbackend.entity.Company;
import ru.oldzoomer.alfacreditbackend.entity.User;
import ru.oldzoomer.alfacreditbackend.repository.CompanyRepository;
import ru.oldzoomer.alfacreditbackend.repository.UserRepository;

import java.util.Optional;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final CompanyRepository companyRepository;
    private final PasswordEncoder passwordEncoder;

    public UserService(UserRepository userRepository, CompanyRepository companyRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.companyRepository = companyRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public User authenticate(String login, String password) {
        Optional<User> opt = userRepository.findByLogin(login);
        if (opt.isPresent()) {
            User user = opt.get();
            if (passwordEncoder.matches(password, user.getPasswordHash())) {
                return user;
            }
        }
        return null;
    }

    public UserDto toUserDto(User user) {
        UserDto.UserDtoBuilder builder = UserDto.builder()
                .id(user.getId())
                .role(user.getRole().name())
                .login(user.getLogin())
                .fullName(user.getFullName())
                .position(user.getPosition());

        if (user.getCompanyId() != null) {
            companyRepository.findById(user.getCompanyId()).ifPresent(company -> {
                builder.company(UserDto.CompanyDto.builder()
                        .id(company.getId())
                        .legalForm(company.getLegalForm().name())
                        .name(company.getName())
                        .inn(company.getInn())
                        .ogrn(company.getOgrn())
                        .okved(company.getOkvedCode())
                        .okvedName(company.getOkvedName())
                        .registeredAt(company.getRegisteredAt().toString())
                        .employees(company.getEmployees())
                        .annualRevenue(company.getAnnualRevenue())
                        .region(company.getRegion())
                        .build());
            });
        }

        return builder.build();
    }

    public void seedDemoData() {
        if (userRepository.findByLogin("romashka").isPresent()) {
            return; // Already seeded
        }

        String password = "demo1234";

        // Company: ООО «Ромашка»
        Company romashka = Company.builder()
                .id("c-romashka")
                .legalForm(ru.oldzoomer.alfacreditbackend.entity.CompanyLegalForm.OOO)
                .name("ООО «Ромашка»")
                .inn("7701234560")
                .ogrn("1127746000007")
                .okvedCode("41.20")
                .okvedName("Строительство жилых и нежилых зданий")
                .registeredAt(java.time.LocalDate.of(2016, 3, 14))
                .employees(42)
                .annualRevenue(86_000_000L)
                .region("Москва")
                .build();
        companyRepository.save(romashka);

        // User: romashka
        userRepository.save(User.builder()
                .id("u-romashka")
                .role(ru.oldzoomer.alfacreditbackend.entity.UserRole.CLIENT)
                .login("romashka")
                .passwordHash(passwordEncoder.encode(password))
                .fullName("Сергей Волков")
                .position("Генеральный директор")
                .companyId(romashka.getId())
                .build());

        // Company: ИП Петрова
        Company petrova = Company.builder()
                .id("c-petrova")
                .legalForm(ru.oldzoomer.alfacreditbackend.entity.CompanyLegalForm.IP)
                .name("ИП Петрова А. С.")
                .inn("780412345685")
                .ogrn("320784700012347")
                .okvedCode("47.71")
                .okvedName("Розничная торговля одеждой в специализированных магазинах")
                .registeredAt(java.time.LocalDate.of(2020, 9, 1))
                .employees(6)
                .annualRevenue(14_500_000L)
                .region("Санкт-Петербург")
                .build();
        companyRepository.save(petrova);

        userRepository.save(User.builder()
                .id("u-petrova")
                .role(ru.oldzoomer.alfacreditbackend.entity.UserRole.CLIENT)
                .login("petrova")
                .passwordHash(passwordEncoder.encode(password))
                .fullName("Анна Петрова")
                .position("Индивидуальный предприниматель")
                .companyId(petrova.getId())
                .build());

        // Company: ИП Новиков
        Company novikov = Company.builder()
                .id("c-novikov")
                .legalForm(ru.oldzoomer.alfacreditbackend.entity.CompanyLegalForm.IP)
                .name("ИП Новиков Д. А.")
                .inn("165512345632")
                .ogrn("326169000045678")
                .okvedCode("56.10")
                .okvedName("Деятельность ресторанов и услуги по доставке продуктов питания")
                .registeredAt(java.time.LocalDate.of(2026, 2, 10))
                .employees(4)
                .annualRevenue(3_700_000L)
                .region("Республика Татарстан")
                .build();
        companyRepository.save(novikov);

        userRepository.save(User.builder()
                .id("u-novikov")
                .role(ru.oldzoomer.alfacreditbackend.entity.UserRole.CLIENT)
                .login("novikov")
                .passwordHash(passwordEncoder.encode(password))
                .fullName("Дмитрий Новиков")
                .position("Индивидуальный предприниматель")
                .companyId(novikov.getId())
                .build());

        // Officer: ivanova
        userRepository.save(User.builder()
                .id("u-ivanova")
                .role(ru.oldzoomer.alfacreditbackend.entity.UserRole.OFFICER)
                .login("ivanova")
                .passwordHash(passwordEncoder.encode(password))
                .fullName("Мария Иванова")
                .position("Кредитный специалист")
                .build());
    }
}
